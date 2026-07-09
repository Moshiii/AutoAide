# CodexBridge

CodexBridge transforme Codex en assistant d'equipe gere pour Feishu, Telegram et les operateurs locaux, avec controle d'acces par utilisateur, credits, journaux d'audit et espaces de travail persistants.

Langues : [中文](../../README.md) · [English](README.en.md) · Français · [日本語](README.ja.md) · [한국어](README.ko.md)

[Demarrage](../getting-started.md) · [Reference API](../api-reference.md) · [Architecture](../current-architecture.md) · [Roadmap](../../ROADMAP.md) · [Telegram](../telegram-codex-bridge.md) · [Feishu](../feishu-channel-current-state.md)

[![Node.js >=22](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](../../package.json)
[![Version](https://img.shields.io/badge/version-0.1.0--alpha.7-blue)](../../package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](../../LICENSE)

```text
Ask Codex:
Install Moshiii/CodexBridge from GitHub and start CodexBridge.
```

## Apercu

Captures produit actuelles montrant comment CodexBridge distribue Codex aux utilisateurs d'equipe tout en gardant le controle operateur sur les utilisateurs, credits, runtimes et workspaces.

<table>
  <tr>
    <td width="50%">
      <img src="../assets/screenshots/feishu-groupchat.png" alt="Discussion de groupe Feishu avec CodexBridge" />
      <br />
      <strong>Point d'entree groupe Feishu</strong>
      <br />
      <sub>Les membres de l'equipe peuvent appeler CodexBridge depuis un groupe Feishu.</sub>
    </td>
    <td width="50%">
      <img src="../assets/screenshots/team%20config.png" alt="Configuration equipe et console web CodexBridge" />
      <br />
      <strong>Configuration equipe et console de controle</strong>
      <br />
      <sub>Les operateurs gerent bots, runtimes, canaux et acces equipe.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="../assets/screenshots/codexbridge%20tui.png" alt="Chat TUI local CodexBridge" />
      <br />
      <strong>TUI local multi-tour</strong>
      <br />
      <sub>Les operateurs locaux continuent le meme fil de bot dans un terminal style Codex.</sub>
    </td>
    <td width="50%">
      <img src="../assets/screenshots/codexbridge_teminal.png" alt="Entree CLI et statut runtime CodexBridge" />
      <br />
      <strong>Entree CLI et statut</strong>
      <br />
      <sub>Verifier le bot actif, runtime, canal et workspace depuis la ligne de commande.</sub>
    </td>
  </tr>
</table>

## Pourquoi CodexBridge

Codex est puissant dans un terminal local. Les equipes ont besoin d'un moyen plus sur de donner acces a cette capacite sans fournir un shell, une machine ou un acces de compte non gere.

CodexBridge ajoute la couche operationnelle manquante :

- Entrees Feishu et Telegram pour les utilisateurs
- Controle d'acces par bot, deblocage prive, bannissements et roles
- Quota gratuit quotidien, credits payants, journal d'utilisation et audit admin
- Espaces persistants pour fichiers, memoire, sessions et logs
- Console web pour runtime, utilisateurs, credits, securite et fichiers de workspace
- TUI local pour les operateurs qui veulent une experience terminal proche de Codex

La valeur est l'acces gere. Les utilisateurs obtiennent une interface de chat simple ; l'operateur garde le controle sur l'identite, les quotas, les couts, l'etat du workspace et le risque.

## Cas d'usage

- **Assistant IA d'equipe dans Feishu** : permettre a des collegues ou groupes selectionnes de demander recherche, redaction, resumes, travail sur fichiers et planification.
- **Acces Codex controle** : fournir du travail adosse a Codex sans exposer votre terminal ou votre hote.
- **Bots avec workspaces partages** : creer des bots separes pour projets, clients, equipes ou workflows.
- **Gouvernance operateur** : inspecter les runs, gerer les credits, revoir les logs, arreter les runtimes et controler l'acces externe.

## Demarrage rapide

### Prerequis

- Node.js `>=22`
- Codex CLI installe sous la commande `codex`
- Rust/Cargo pour l'implementation actuelle de `codexbridge tui`
- Identifiants Telegram ou Feishu uniquement pour les canaux externes

### Installation

La plupart des utilisateurs peuvent demander a Codex de l'installer :

```text
Install Moshiii/CodexBridge from GitHub and start CodexBridge.
```

Installation manuelle :

```bash
npm install -g github:Moshiii/CodexBridge
codexbridge
```

N'utilisez pas `npm install -g codexbridge` ni `npx codexbridge` directement ; le nom `codexbridge` sur npm pointe actuellement vers un autre paquet.

### Premier lancement

`codexbridge` ouvre le menu operateur du bot actif :

```text
CodexBridge Menu · Default (default)
Start chat with current bot
Start runtime
Switch bots
Connect Telegram or Feishu
User management
```

Lancer le chat local :

```bash
codexbridge tui
```

Lancer la console web :

```bash
codexbridge web
```

## Ce que vous pouvez gerer

CodexBridge conserve l'etat de chaque bot sous `~/.codexbridge/bots/<id>`.

Chaque bot possede ses propres :

- workspace et fichiers de memoire
- reglages de canaux Feishu et Telegram
- utilisateurs, credits, bannissements et acces prive
- sessions, runs, logs et audits
- configuration runtime et etat de securite

Pour la configuration complete, consultez [Demarrage](../getting-started.md). Pour les commandes et API locales, consultez [Reference API](../api-reference.md).

## Statut et securite

CodexBridge est un outil developpeur en alpha.

Apportez votre propre acces Codex/OpenAI autorise. CodexBridge n'est pas un fournisseur de modele, pas une couche de revente d'abonnement, et pas un moyen de partager des identifiants de compte. C'est une passerelle controlee par l'operateur autour de votre runtime approuve.

Utilisez-le localement, testez d'abord avec des utilisateurs de confiance, et traitez l'acces par chat externe comme sensible. Une politique applicative n'est pas une isolation hote. Avant de laisser des utilisateurs externes non fiables executer Codex via votre machine, verifiez une isolation forte avec utilisateur OS separe, conteneur, sandbox, microVM ou remote worker.

## Documentation

- [Getting Started](../getting-started.md) - installation, premier lancement, TUI, console web, Telegram, Feishu
- [API Reference](../api-reference.md) - commandes CLI et API web locale
- [Runtime Layout](../runtime-layout.md) - fichiers sous `~/.codexbridge`
- [Current Architecture](../current-architecture.md) - frontieres de modules et modele runtime
- [Capability Overview](../codexbridge-capability-overview.md) - capacites actuelles
- [Demo Workflows](../demo-workflows.md) - exemples de taches
- [Roadmap](../../ROADMAP.md) - direction produit et engineering
- [Test Plan](../test-plan.md) - approche de validation
- [Telegram Bridge](../telegram-codex-bridge.md) - details du canal Telegram
- [Feishu Channel State](../feishu-channel-current-state.md) - etat actuel Feishu/Lark

## Developpement

```bash
npm install
npm test
npm start
```

## Support et securite

- Bugs et demandes de fonctionnalites : ouvrez une GitHub issue.
- Questions de securite : ne publiez pas de secrets ni de logs prives publiquement ; contactez le mainteneur en prive.
- Securite operationnelle : utilisez une isolation forte avant d'inviter des utilisateurs externes non fiables.

## Licence

MIT
