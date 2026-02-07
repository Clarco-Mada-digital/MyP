# My Professor - Plateforme d'Apprentissage Intelligente

Une plateforme d'apprentissage moderne qui combine la puissance de l'IA générative avec des outils de création manuelle pour offrir une expérience d'apprentissage personnalisée et interactive.

## 🌟 Fonctionnalités Principales

### 🤖 Génération de Cours par IA
- Génération automatique de cours structurés via Google Gemini ou OpenRouter
- Support de modèles locaux avec Ollama (gratuit et privé)
- Contenu riche avec modules, leçons, exercices et quiz

### ✍️ Création Manuelle (BÊTA)
- Éditeur complet pour créer vos propres cours
- Support Markdown avec barre d'outils visuelle
- Gestion de modules, leçons, exercices pratiques et quiz interactifs
- Ajout de ressources externes (liens, documentation)
- Catégorisation des cours

### 📚 Gestion de Parcours
- Création de parcours d'apprentissage personnalisés
- Mode séquentiel pour un apprentissage progressif
- Suivi de progression avec badges et statistiques

### 🌐 Communauté
- Partage de parcours avec la communauté
- Importation de parcours créés par d'autres utilisateurs
- Système de découverte avec filtres

## 🛠️ Stack Technique

- **Backend**: AdonisJS 6 (TypeScript)
- **Base de données**: PostgreSQL avec Lucid ORM
- **Frontend**: Edge Templates + Alpine.js
- **Styling**: TailwindCSS
- **IA**: Google Gemini, OpenRouter, Ollama
- **Build**: Vite

## 📦 Installation

```bash
# Cloner le repository
git clone <repo-url>
cd MyP

# Installer les dépendances
npm install

# Configurer l'environnement
cp .env.example .env
# Éditer .env avec vos clés API

# Lancer les migrations
node ace migration:run

# Démarrer le serveur de développement
npm run dev
```

## 🔑 Configuration

Configurez les variables d'environnement dans `.env` :

```env
# Base de données
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=
DB_DATABASE=myp

# IA (optionnel - au moins une clé requise)
GEMINI_API_KEY=your_gemini_key
OPENROUTER_API_KEY=your_openrouter_key
OLLAMA_BASE_URL=http://localhost:11434
```

## 📖 Documentation

Consultez le [Guide d'utilisation](PROJECT_STATUS.md) pour plus de détails sur les fonctionnalités et l'état du projet.

## 🚀 Roadmap

- [ ] Drag & drop pour réorganiser les modules
- [ ] Export de cours en PDF
- [ ] Mode sombre
- [ ] Système de likes pour les parcours partagés
- [ ] Notifications en temps réel

## 📄 Licence

Ce projet est sous licence MIT.

---

**Version**: 0.5 (Beta)  
**Dernière mise à jour**: Février 2026
