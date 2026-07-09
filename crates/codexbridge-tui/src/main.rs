use std::{
    env,
    io::{self, Stdout, Write},
    process::{Command, Stdio},
    sync::mpsc::{self, Receiver, TryRecvError},
    thread,
    time::{Duration, Instant},
};

use anyhow::{anyhow, Context, Result};
use crossterm::{
    event::{self, Event, KeyCode, KeyEvent, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{List, ListItem, ListState, Paragraph, Wrap},
    Frame, Terminal,
};
use serde::Deserialize;

#[derive(Debug, Clone, Default, Deserialize)]
struct Bot {
    id: String,
    name: Option<String>,
    enabled: Option<bool>,
    channel: Option<String>,
    #[serde(rename = "runtimePid")]
    runtime_pid: Option<u32>,
    #[serde(rename = "homePath")]
    home_path: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Screen {
    Shell,
    Bots,
}

#[derive(Debug, Clone)]
enum TranscriptItem {
    User(String),
    Assistant(String),
    Status(String),
    Warning(String),
    ToolStart(String),
    ToolDone { action: String, detail: String },
    Divider(String),
}

#[derive(Clone)]
struct Bridge {
    node_bin: String,
    bridge_bin: String,
}

#[derive(Debug, Deserialize)]
struct TuiTurnResponse {
    ok: bool,
    output: String,
    error: Option<String>,
    #[serde(rename = "sessionLabel")]
    session_label: String,
    #[serde(rename = "cliSessionRef")]
    cli_session_ref: Option<String>,
    resumed: bool,
    statuses: Vec<String>,
}

struct RunningTurn {
    started: Instant,
    receiver: Receiver<TurnOutcome>,
}

struct TurnOutcome {
    result: std::result::Result<TuiTurnResponse, String>,
}

impl Bridge {
    fn from_args() -> Self {
        let mut bridge_bin =
            env::var("CODEXBRIDGE_NODE_BIN").unwrap_or_else(|_| "bin/codexbridge.mjs".to_string());
        let mut node_bin = env::var("NODE_BIN").unwrap_or_else(|_| "node".to_string());
        let mut args = env::args().skip(1);
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--bridge-bin" => {
                    if let Some(value) = args.next() {
                        bridge_bin = value;
                    }
                }
                "--node-bin" => {
                    if let Some(value) = args.next() {
                        node_bin = value;
                    }
                }
                _ => {}
            }
        }
        Self {
            node_bin,
            bridge_bin,
        }
    }

    fn run(&self, args: &[&str]) -> Result<String> {
        let output = Command::new(&self.node_bin)
            .arg(&self.bridge_bin)
            .args(args)
            .output()
            .with_context(|| format!("failed to run {} {}", self.node_bin, self.bridge_bin))?;
        if !output.status.success() {
            return Err(anyhow!(
                "{}",
                String::from_utf8_lossy(&output.stderr).trim().to_string()
            ));
        }
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    fn run_with_input(&self, args: &[&str], input: &str) -> Result<String> {
        let mut child = Command::new(&self.node_bin)
            .arg(&self.bridge_bin)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .with_context(|| format!("failed to run {} {}", self.node_bin, self.bridge_bin))?;

        if let Some(stdin) = child.stdin.as_mut() {
            stdin
                .write_all(input.as_bytes())
                .context("failed to send prompt to codexbridge")?;
        }

        let output = child
            .wait_with_output()
            .context("failed to wait for codexbridge")?;
        if !output.status.success() {
            return Err(anyhow!(
                "{}",
                String::from_utf8_lossy(&output.stderr).trim().to_string()
            ));
        }
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    fn json<T: for<'de> Deserialize<'de>>(&self, args: &[&str]) -> Result<T> {
        let stdout = self.run(args)?;
        serde_json::from_str(&stdout)
            .with_context(|| format!("invalid JSON from codexbridge {:?}", args))
    }

    fn list_bots(&self) -> Result<Vec<Bot>> {
        self.json(&["bots"])
    }

    fn current_bot(&self) -> Result<Bot> {
        self.json(&["bot", "current"])
    }

    fn use_bot(&self, id: &str) -> Result<()> {
        let _bot: Bot = self.json(&["bot", "use", id])?;
        Ok(())
    }

    fn start_bot(&self, id: &str) -> Result<()> {
        self.run(&["bot", "start", id]).map(|_| ())
    }

    fn stop_bot(&self, id: &str) -> Result<()> {
        self.run(&["bot", "stop", id]).map(|_| ())
    }

    fn run_turn(&self, id: &str, prompt: &str) -> Result<TuiTurnResponse> {
        let stdout = self.run_with_input(&["tui-turn", id], prompt)?;
        serde_json::from_str(&stdout).context("invalid JSON from codexbridge tui-turn")
    }
}

struct App {
    bridge: Bridge,
    bots: Vec<Bot>,
    current: Bot,
    screen: Screen,
    bot_index: usize,
    input: String,
    transcript: Vec<TranscriptItem>,
    should_quit: bool,
    codex_status: String,
    running_turn: Option<RunningTurn>,
}

impl App {
    fn load(bridge: Bridge) -> Result<Self> {
        let current = bridge.current_bot()?;
        let bots = bridge.list_bots()?;
        let bot_index = selected_bot_index(&bots, &current.id);
        Ok(Self {
            bridge,
            bots,
            current,
            screen: Screen::Shell,
            bot_index,
            input: String::new(),
            transcript: vec![
                TranscriptItem::Status(
                    "Commands: /bots /start /stop /refresh /help /quit".to_string(),
                ),
                TranscriptItem::Assistant(
                    "Ready. Type a request, or use /bots to switch bots.".to_string(),
                ),
                TranscriptItem::Status(
                    "Multi-turn Codex session is live; each reply resumes the current bot thread."
                        .to_string(),
                ),
            ],
            should_quit: false,
            codex_status: codex_cli_status(),
            running_turn: None,
        })
    }

    fn push_item(&mut self, item: TranscriptItem) {
        self.transcript.push(item);
        let overflow = self.transcript.len().saturating_sub(40);
        if overflow > 0 {
            self.transcript.drain(0..overflow);
        }
    }

    fn refresh(&mut self) {
        match (self.bridge.current_bot(), self.bridge.list_bots()) {
            (Ok(current), Ok(bots)) => {
                self.current = current;
                self.bots = bots;
                self.bot_index = selected_bot_index(&self.bots, &self.current.id);
                self.codex_status = codex_cli_status();
                self.push_item(TranscriptItem::Status("Refreshed.".to_string()));
            }
            (Err(error), _) | (_, Err(error)) => {
                self.push_item(TranscriptItem::Warning(format!("Refresh failed: {error}")));
            }
        }
    }

    fn move_next(&mut self) {
        if self.screen == Screen::Bots && !self.bots.is_empty() {
            self.bot_index = (self.bot_index + 1) % self.bots.len();
        }
    }

    fn move_previous(&mut self) {
        if self.screen == Screen::Bots && !self.bots.is_empty() {
            self.bot_index = self.bot_index.checked_sub(1).unwrap_or(self.bots.len() - 1);
        }
    }

    fn submit(&mut self) {
        if self.screen == Screen::Bots {
            self.submit_bot();
            return;
        }

        let prompt = self.input.trim().to_string();
        self.input.clear();
        if prompt.is_empty() {
            return;
        }
        self.push_item(TranscriptItem::User(prompt.clone()));

        match prompt.as_str() {
            "/bots" => {
                self.screen = Screen::Bots;
                self.push_item(TranscriptItem::Status(
                    "Select a bot. Enter switches; Esc returns.".to_string(),
                ));
            }
            "/start" => {
                let id = self.current.id.clone();
                match self.bridge.start_bot(&id) {
                    Ok(()) => {
                        self.refresh();
                        self.push_item(TranscriptItem::ToolDone {
                            action: "Runtime start requested".to_string(),
                            detail: id,
                        });
                    }
                    Err(error) => {
                        self.push_item(TranscriptItem::Warning(format!("Start failed: {error}")))
                    }
                }
            }
            "/stop" => {
                let id = self.current.id.clone();
                match self.bridge.stop_bot(&id) {
                    Ok(()) => {
                        self.refresh();
                        self.push_item(TranscriptItem::ToolDone {
                            action: "Runtime stopped".to_string(),
                            detail: id,
                        });
                    }
                    Err(error) => {
                        self.push_item(TranscriptItem::Warning(format!("Stop failed: {error}")))
                    }
                }
            }
            "/refresh" => self.refresh(),
            "/help" => self.push_item(TranscriptItem::Assistant(
                "Commands: /bots /start /stop /refresh /help /quit".to_string(),
            )),
            "/quit" | "/exit" => self.should_quit = true,
            text if text.starts_with('/') => {
                self.push_item(TranscriptItem::Warning(format!("Unknown command: {text}")));
            }
            _ => {
                if self.running_turn.is_some() {
                    self.push_item(TranscriptItem::Warning(
                        "main is already running. Wait for it to finish.".to_string(),
                    ));
                    return;
                }
                self.push_item(TranscriptItem::ToolStart("Running Codex turn".to_string()));
                let (sender, receiver) = mpsc::channel();
                let bridge = self.bridge.clone();
                let bot_id = self.current.id.clone();
                thread::spawn(move || {
                    let result = bridge
                        .run_turn(&bot_id, &prompt)
                        .map_err(|error| error.to_string());
                    let _ = sender.send(TurnOutcome { result });
                });
                self.running_turn = Some(RunningTurn {
                    started: Instant::now(),
                    receiver,
                });
            }
        }
    }

    fn poll_running_turn(&mut self) {
        let Some(running) = self.running_turn.as_ref() else {
            return;
        };

        match running.receiver.try_recv() {
            Ok(outcome) => {
                let Some(running) = self.running_turn.take() else {
                    return;
                };
                self.finish_turn(outcome, running.started.elapsed());
            }
            Err(TryRecvError::Empty) => {}
            Err(TryRecvError::Disconnected) => {
                let Some(running) = self.running_turn.take() else {
                    return;
                };
                self.push_item(TranscriptItem::Warning(
                    "Codex turn failed: execution bridge disconnected.".to_string(),
                ));
                self.push_item(TranscriptItem::Divider(format!(
                    "Worked for {}",
                    format_elapsed(running.started.elapsed())
                )));
            }
        }
    }

    fn finish_turn(&mut self, outcome: TurnOutcome, elapsed: Duration) {
        match outcome.result {
            Ok(turn) => {
                for status in turn.statuses {
                    self.push_item(TranscriptItem::Status(status));
                }
                if turn.ok {
                    self.push_item(TranscriptItem::Assistant(turn.output));
                    let thread = turn.cli_session_ref.as_deref().unwrap_or("no thread id");
                    let mode = if turn.resumed { "resumed" } else { "started" };
                    self.push_item(TranscriptItem::ToolDone {
                        action: format!("Session {} ({})", mode, turn.session_label),
                        detail: thread.to_string(),
                    });
                } else {
                    self.push_item(TranscriptItem::Warning(format!(
                        "Codex turn failed: {}",
                        turn.error.unwrap_or_else(|| "unknown error".to_string())
                    )));
                }
            }
            Err(error) => {
                self.push_item(TranscriptItem::Warning(format!(
                    "Codex turn failed: {error}"
                )));
            }
        }
        self.push_item(TranscriptItem::Divider(format!(
            "Worked for {}",
            format_elapsed(elapsed)
        )));
    }

    fn submit_bot(&mut self) {
        let Some(bot) = self.bots.get(self.bot_index).cloned() else {
            return;
        };
        match self.bridge.use_bot(&bot.id) {
            Ok(()) => {
                self.refresh();
                self.screen = Screen::Shell;
                self.push_item(TranscriptItem::ToolDone {
                    action: "Switched bot".to_string(),
                    detail: bot_display_name(&bot),
                });
            }
            Err(error) => {
                self.push_item(TranscriptItem::Warning(format!("Switch failed: {error}")))
            }
        }
    }

    fn handle_key(&mut self, key: KeyEvent) {
        if key.kind != KeyEventKind::Press {
            return;
        }
        match self.screen {
            Screen::Shell => self.handle_shell_key(key),
            Screen::Bots => match key.code {
                KeyCode::Esc => self.screen = Screen::Shell,
                KeyCode::Char('q') => self.should_quit = true,
                KeyCode::Down | KeyCode::Char('j') => self.move_next(),
                KeyCode::Up | KeyCode::Char('k') => self.move_previous(),
                KeyCode::Enter => self.submit(),
                _ => {}
            },
        }
    }

    fn handle_shell_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Enter => self.submit(),
            KeyCode::Backspace => {
                self.input.pop();
            }
            KeyCode::Char(c) => self.input.push(c),
            _ => {}
        }
    }
}

fn selected_bot_index(bots: &[Bot], current_id: &str) -> usize {
    bots.iter()
        .position(|bot| bot.id == current_id)
        .unwrap_or(0)
}

fn codex_cli_status() -> String {
    match Command::new("codex").arg("--version").output() {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .unwrap_or("available")
            .to_string(),
        Ok(_) => "unavailable".to_string(),
        Err(_) => "not found".to_string(),
    }
}

fn main() -> Result<()> {
    let bridge = Bridge::from_args();
    let mut app = App::load(bridge)?;
    let mut terminal = setup_terminal()?;
    let result = run_app(&mut terminal, &mut app);
    restore_terminal(&mut terminal)?;
    result
}

type Term = Terminal<CrosstermBackend<Stdout>>;

fn setup_terminal() -> Result<Term> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    Terminal::new(CrosstermBackend::new(stdout)).context("failed to initialize terminal")
}

fn restore_terminal(terminal: &mut Term) -> Result<()> {
    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    Ok(())
}

fn run_app(terminal: &mut Term, app: &mut App) -> Result<()> {
    while !app.should_quit {
        app.poll_running_turn();
        terminal.draw(|frame| render(frame, app))?;
        if event::poll(Duration::from_millis(200))? {
            if let Event::Key(key) = event::read()? {
                app.handle_key(key);
            }
        }
    }
    Ok(())
}

fn render(frame: &mut Frame, app: &App) {
    match app.screen {
        Screen::Shell => render_shell_flow(frame, app, frame.area()),
        Screen::Bots => render_bots_flow(frame, app, frame.area()),
    }
}

fn render_shell_flow(frame: &mut Frame, app: &App, area: Rect) {
    let width = area.width as usize;
    let mut lines = status_lines(app, width);
    lines.push(Line::from(""));
    for item in &app.transcript {
        lines.extend(transcript_lines(item, width));
    }
    if let Some(running) = &app.running_turn {
        lines.push(Line::from(vec![
            muted("• "),
            Span::styled(
                format!("Working {}", format_elapsed(running.started.elapsed())),
                Style::default()
                    .fg(Color::Gray)
                    .add_modifier(Modifier::BOLD),
            ),
        ]));
    }
    lines.push(Line::from(""));

    let content_height = (lines.len() as u16).min(area.height);
    let content_area = Rect {
        x: area.x,
        y: area.y,
        width: area.width,
        height: content_height,
    };
    frame.render_widget(
        Paragraph::new(lines).wrap(Wrap { trim: true }),
        content_area,
    );

    let input_y = area.y.saturating_add(content_height);
    if input_y >= area.y.saturating_add(area.height) {
        return;
    }
    render_input_block(
        frame,
        app,
        Rect {
            x: area.x,
            y: input_y,
            width: area.width,
            height: area.y.saturating_add(area.height).saturating_sub(input_y),
        },
    );
}

fn status_lines(app: &App, width: usize) -> Vec<Line<'static>> {
    let card_width = width.min(78).max(width.min(40));
    let bot_label = clip_middle(&bot_display_name(&app.current), 22);
    let workspace = clip_middle(
        &short_workspace(&app.current),
        card_width.saturating_sub(13),
    );
    vec![
        box_border("┌", "─", "┐", card_width),
        box_text(
            ">_ CodexBridge",
            card_width,
            Style::default().fg(Color::Gray),
        ),
        box_text("", card_width, Style::default()),
        box_text(
            &format!("{:<9}{:<24}{:<9}{}", "bot:", bot_label, "model:", "gpt-5.4"),
            card_width,
            Style::default().fg(Color::Gray),
        ),
        box_text(
            &format!(
                "{:<9}{:<16}{:<9}{}",
                "runtime:",
                runtime_label(&app.current),
                "channel:",
                channel_label(&app.current)
            ),
            card_width,
            Style::default().fg(Color::Gray),
        ),
        box_text(
            &format!("codex cli: {}", app.codex_status),
            card_width,
            Style::default().fg(Color::Gray),
        ),
        box_text(
            &format!("workspace: {workspace}"),
            card_width,
            Style::default().fg(Color::Gray),
        ),
        box_border("└", "─", "┘", card_width),
    ]
}

fn render_bots_flow(frame: &mut Frame, app: &App, area: Rect) {
    let width = area.width as usize;
    let mut top_lines = status_lines(app, width);
    top_lines.push(Line::from(""));
    top_lines.push(Line::from(vec![
        brand("Bots"),
        muted("  ↑/↓ select · enter switch · esc return"),
    ]));
    let top_height = top_lines.len().min(area.height as usize) as u16;
    let top_area = Rect {
        x: area.x,
        y: area.y,
        width: area.width,
        height: top_height,
    };
    frame.render_widget(
        Paragraph::new(top_lines).wrap(Wrap { trim: true }),
        top_area,
    );

    if top_height >= area.height {
        return;
    }
    let list_area = Rect {
        x: area.x,
        y: area.y + top_height,
        width: area.width,
        height: area.height - top_height,
    };
    let items: Vec<ListItem> = app
        .bots
        .iter()
        .map(|bot| {
            let current = if bot.id == app.current.id {
                "current"
            } else {
                ""
            };
            ListItem::new(format!(
                "{:<28} {:<8} {:<9} {}",
                clip_middle(&bot_display_name(bot), 28),
                if bot.enabled.unwrap_or(false) {
                    "enabled"
                } else {
                    "disabled"
                },
                runtime_label(bot),
                current
            ))
        })
        .collect();
    let mut state = ListState::default();
    state.select(Some(app.bot_index));
    let list = List::new(items)
        .highlight_style(
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol("› ");
    frame.render_stateful_widget(list, list_area, &mut state);
}

fn render_input_block(frame: &mut Frame, app: &App, area: Rect) {
    let input_height = area.height.min(3);
    if input_height == 0 {
        return;
    }
    let input_area = Rect {
        x: area.x,
        y: area.y,
        width: area.width,
        height: input_height,
    };
    let width = area.width as usize;
    let placeholder = match app.screen {
        Screen::Shell => "Improve documentation in @filename",
        Screen::Bots => "Filter bots",
    };
    let mut input_lines = vec![input_fill_line(width)];
    input_lines.push(input_line(&app.input, placeholder, width));
    input_lines.push(input_fill_line(width));
    frame.render_widget(
        Paragraph::new(input_lines).style(Style::default().bg(input_bg())),
        input_area,
    );

    let footer_y = input_area.y.saturating_add(input_area.height);
    if footer_y >= area.y.saturating_add(area.height) {
        return;
    }
    let footer_area = Rect {
        x: area.x,
        y: footer_y,
        width: area.width,
        height: 1,
    };
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(
            input_footer(app, width),
            Style::default().fg(Color::Rgb(210, 130, 20)),
        ))),
        footer_area,
    );
}

fn input_line(input: &str, placeholder: &str, width: usize) -> Line<'static> {
    let content_width = width.saturating_sub(2);
    let input_bg = input_bg();
    let mut spans = vec![Span::styled(
        "› ",
        Style::default().bg(input_bg).fg(Color::Gray),
    )];
    if input.is_empty() {
        let mut chars = placeholder.chars();
        if let Some(first) = chars.next() {
            spans.push(Span::styled(
                first.to_string(),
                Style::default()
                    .bg(Color::Rgb(165, 165, 165))
                    .fg(Color::Rgb(230, 230, 230))
                    .add_modifier(Modifier::SLOW_BLINK),
            ));
        }
        let rest: String = chars.collect();
        spans.push(Span::styled(
            rest,
            Style::default().bg(input_bg).fg(Color::Rgb(165, 165, 165)),
        ));
        let used = 2 + display_width(placeholder);
        if width > used {
            spans.push(Span::styled(
                input_fill(width - used),
                Style::default().bg(input_bg),
            ));
        }
    } else {
        let clipped = clip_middle(input, content_width);
        spans.push(Span::styled(
            clipped.clone(),
            Style::default().bg(input_bg).fg(Color::Black),
        ));
        spans.push(Span::styled(
            " ",
            Style::default()
                .bg(Color::Rgb(165, 165, 165))
                .add_modifier(Modifier::SLOW_BLINK),
        ));
        let used = 3 + display_width(&clipped);
        if width > used {
            spans.push(Span::styled(
                input_fill(width - used),
                Style::default().bg(input_bg),
            ));
        }
    }
    Line::from(spans)
}

fn input_fill_line(width: usize) -> Line<'static> {
    Line::from(Span::styled(
        input_fill(width),
        Style::default().bg(input_bg()).fg(input_bg()),
    ))
}

fn input_fill(width: usize) -> String {
    "\u{00a0}".repeat(width)
}

fn input_footer(app: &App, width: usize) -> String {
    let workspace_width = width.saturating_sub(13);
    match app.screen {
        Screen::Shell => format!(
            "gpt-5.4 · {}",
            clip_middle(&short_workspace(&app.current), workspace_width)
        ),
        Screen::Bots => "↑/↓ select · enter switch · esc return".to_string(),
    }
}

fn input_bg() -> Color {
    Color::Rgb(238, 238, 238)
}

fn box_border(left: &str, fill: &str, right: &str, width: usize) -> Line<'static> {
    if width < 2 {
        return Line::from("");
    }
    Line::from(Span::styled(
        format!("{left}{}{right}", fill.repeat(width - 2)),
        Style::default().fg(Color::DarkGray),
    ))
}

fn box_text(text: &str, width: usize, style: Style) -> Line<'static> {
    if width < 2 {
        return Line::from("");
    }
    let inner_width = width - 2;
    let text = clip_middle(text, inner_width);
    Line::from(vec![
        Span::styled("│", Style::default().fg(Color::DarkGray)),
        Span::styled(padded(text, inner_width), style),
        Span::styled("│", Style::default().fg(Color::DarkGray)),
    ])
}

fn transcript_lines(item: &TranscriptItem, width: usize) -> Vec<Line<'static>> {
    match item {
        TranscriptItem::User(text) => vec![
            Line::from(Span::styled(
                padded(format!("› {text}"), width),
                Style::default().bg(input_bg()).fg(Color::Black),
            )),
            Line::from(""),
        ],
        TranscriptItem::Assistant(text) => vec![Line::from(vec![muted("• "), value(text)])],
        TranscriptItem::Status(text) => vec![Line::from(vec![muted("• "), value(text)])],
        TranscriptItem::Warning(text) => vec![Line::from(vec![
            Span::styled("△ ", Style::default().fg(Color::Rgb(150, 145, 0))),
            Span::styled(
                text.to_string(),
                Style::default().fg(Color::Rgb(150, 145, 0)),
            ),
        ])],
        TranscriptItem::ToolStart(action) => vec![Line::from(vec![
            Span::styled("• ", Style::default().fg(Color::Gray)),
            Span::styled(
                action.to_string(),
                Style::default()
                    .fg(Color::Gray)
                    .add_modifier(Modifier::BOLD),
            ),
        ])],
        TranscriptItem::ToolDone { action, detail } => vec![Line::from(vec![
            muted("• "),
            Span::styled(
                action.to_string(),
                Style::default()
                    .fg(Color::Gray)
                    .add_modifier(Modifier::BOLD),
            ),
            muted(" for "),
            value(detail),
        ])],
        TranscriptItem::Divider(text) => vec![Line::from(Span::styled(
            divider(text, width),
            Style::default().fg(Color::Gray),
        ))],
    }
}

fn padded(text: String, width: usize) -> String {
    let current = display_width(&text);
    if current >= width {
        return text;
    }
    format!("{text}{}", " ".repeat(width - current))
}

fn divider(text: &str, width: usize) -> String {
    let prefix = format!("— {text} ");
    let prefix_width = display_width(&prefix);
    if prefix_width >= width {
        return prefix;
    }
    format!("{prefix}{}", "─".repeat(width - prefix_width))
}

fn format_elapsed(duration: Duration) -> String {
    let elapsed = duration.as_secs();
    format!("{:02}:{:02}", elapsed / 60, elapsed % 60)
}

fn brand(text: &str) -> Span<'static> {
    Span::styled(
        text.to_string(),
        Style::default()
            .fg(Color::Gray)
            .add_modifier(Modifier::BOLD),
    )
}

fn value(text: &str) -> Span<'static> {
    Span::raw(text.to_string())
}

fn muted(text: &str) -> Span<'static> {
    Span::styled(text.to_string(), Style::default().fg(Color::Gray))
}

fn bot_display_name(bot: &Bot) -> String {
    let name = bot
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or(&bot.id);
    format!("{name} ({})", bot.id)
}

fn short_workspace(bot: &Bot) -> String {
    let Some(path) = bot.home_path.as_deref() else {
        return "~".to_string();
    };
    let Ok(home) = env::var("HOME") else {
        return path.to_string();
    };
    path.strip_prefix(&home)
        .map(|suffix| format!("~{suffix}"))
        .unwrap_or_else(|| path.to_string())
}

fn clip_middle(text: &str, max: usize) -> String {
    let len = display_width(text);
    if len <= max || max < 8 {
        return text.to_string();
    }
    let head_len = (max - 1) / 2;
    let tail_len = max - head_len - 1;
    let head = take_display_prefix(text, head_len);
    let tail = take_display_suffix(text, tail_len);
    format!("{head}…{tail}")
}

fn display_width(text: &str) -> usize {
    text.chars().map(char_width).sum()
}

fn char_width(ch: char) -> usize {
    match ch {
        '\u{0000}'..='\u{001f}' | '\u{007f}' => 0,
        '\u{1100}'..='\u{115f}'
        | '\u{2329}'..='\u{232a}'
        | '\u{2e80}'..='\u{a4cf}'
        | '\u{ac00}'..='\u{d7a3}'
        | '\u{f900}'..='\u{faff}'
        | '\u{fe10}'..='\u{fe19}'
        | '\u{fe30}'..='\u{fe6f}'
        | '\u{ff00}'..='\u{ff60}'
        | '\u{ffe0}'..='\u{ffe6}' => 2,
        _ => 1,
    }
}

fn take_display_prefix(text: &str, max_width: usize) -> String {
    let mut out = String::new();
    let mut width = 0;
    for ch in text.chars() {
        let ch_width = char_width(ch);
        if width + ch_width > max_width {
            break;
        }
        out.push(ch);
        width += ch_width;
    }
    out
}

fn take_display_suffix(text: &str, max_width: usize) -> String {
    let mut chars = Vec::new();
    let mut width = 0;
    for ch in text.chars().rev() {
        let ch_width = char_width(ch);
        if width + ch_width > max_width {
            break;
        }
        chars.push(ch);
        width += ch_width;
    }
    chars.into_iter().rev().collect()
}

fn runtime_label(bot: &Bot) -> &str {
    if bot.runtime_pid.is_some() {
        "online"
    } else {
        "offline"
    }
}

fn channel_label(bot: &Bot) -> &str {
    bot.channel.as_deref().unwrap_or("telegram")
}
