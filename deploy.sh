#!/bin/bash

echo "🚀 Déploiement des fonctionnalités de sauvegarde et restauration..."

# Installation des dépendances
echo "📦 Installation des dépendances..."
npm install

# Exécuter les migrations
echo "🗄️ Exécution des migrations..."
node ace migration:run

# Démarrer le serveur de développement
echo "🌐 Démarrage du serveur de développement..."
npm run dev
