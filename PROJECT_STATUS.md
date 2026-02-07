# État du Projet "My Professor" (MyP)

**Dernière mise à jour :** 15 Janvier 2026
**Version :** 0.5 (Beta)

## 📌 Résumé

L'application est une plateforme d'apprentissage générée par IA (AdonisJS + Google Gemini). L'utilisateur peut demander un cours sur n'importe quel sujet, l'IA génère le contenu (modules, leçons), et l'application l'affiche sous forme de cours structuré.

## ✅ Fonctionnalités Implémentées (Session du 15/01)

### 1. Génération de Cours (IA)

- **Moteur** : Google Gemini API (`gemini-2.0-flash-lite`).
- **Logique** : Prompt structuré pour obtenir un JSON strict avec modules et leçons.
- **Robustesse** :
  - Gestion des erreurs `JSON.parse`.
  - Nettoyage automatique des balises Markdown (```json) dans les réponses brutes.
  - **Auto-Retry** : Système de ré-essai automatique (3 tentatives) en cas d'erreur 429 (Rate Limit).

### 2. Affichage & UX

- **Markdown** : Rendu riche des leçons via `marked.js` (titres, gras, code blocks...).
- **Style** : Design propre avec TailwindCSS (Glassmorphism, dégradés).
- **Navigation** : Barre de progression et suivi des leçons terminées (case à cocher).
- **Suppression** : Possibilité de supprimer un cours (et sa progression) depuis le dashboard.

### 3. Dashboard "Premium"

La page "Mes Cours" a été transformée en tableau de bord complet :

- **Hero Section** : Affiche le dernier cours consulté pour une reprise rapide.
- **Statistiques** : Temps d'apprentissage (estimé), nombre de cours terminés.
- **Gamification** : Système de badges automatiques (Débutant, Bibliothécaire, Assidu...).

### 4. Communauté & Partage (Refonte 27/01)

- **Centralisation** : Fusion de "Social" et "Découverte" en une section unique "Communauté".
- **Bibliothèque Publique** : Système de découverte des parcours partagés avec filtres par pertinence et popularité.
- **Importation Directe** : Possibilité d'importer un parcours partagé directement dans son dashboard personnel (duplication des cours).
- **Nettoyage** : Suppression des modules inutiles (Forums, Groupes, Mentorat) qui alourdissaient l'application sans valeur ajoutée.
- **Design Premium** : Refonte visuelle complète pour une expérience utilisateur moderne et fluide.

### 5. Création et Édition Manuelle (BÊTA - 07/02)

- **Mode Créateur** : Possibilité de créer des cours entièrement à la main, sans dépendre de l'IA.
- **Éditeur Riche** :
  - Gestion complète des **Modules** (Ajout, suppression, titre).
  - Gestion des **Leçons** avec contenu Markdown et éditeur visuel.
  - Ajout d'**Exercices Pratiques** pour chaque module.
  - Ajout de **Quiz Interactifs** (QCM) avec explications.
- **Interface Intuitive** : UI moderne avec Alpine.js pour une expérience fluide.
- **Catégorisation** : Classement des cours par catégories.

## ⚠️ Problèmes Connus

- **Erreur 429 (Too Many Requests)** : Le quota gratuit de l'API Gemini est limité.
- **Importation** : Les images des cours importés dépendent de l'original, une duplication des assets pourrait être envisagée.

## 🚀 Prochaines Étapes (Backlog)

1. **Quiz Interactifs** : Générer des QCM à la fin de chaque module pour valider les connaissances.
2. **Système de Likes** : Ajouter la possibilité de liker les parcours partagés.
3. **Mode Sombre** : Basculer tout le site en dark mode.

---

_Dernière mise à jour par Antigravity._
