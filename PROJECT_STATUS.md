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

## ⚠️ Problèmes Connus
- **Erreur 429 (Too Many Requests)** : Le quota gratuit de l'API Gemini est assez bas. Lors de tests intensifs, l'API renvoie des erreurs 429. Le système de retry aide, mais une pause est parfois nécessaire.

## 🚀 Prochaines Étapes (Backlog)

1. **Quiz Interactifs** : Générer des QCM à la fin de chaque module pour valider les connaissances.
2. **Progression Réelle** : Affiner le calcul du temps d'apprentissage (basé sur la lecture réelle plutôt qu'une estimation par leçon). 
3. **Optimisation Mobile** : Vérifier le rendu du dashboard sur petit écran.
4. **Mode Sombre** : Basculer tout le site en dark mode (préparé via Tailwind).

---
*Ce fichier sert de point de reprise pour la prochaine session de développement.*
