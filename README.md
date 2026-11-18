# Cours de Big Data - Supabase

Projet Node.js pour créer le schéma e-commerce dans Supabase puis
générer des données de démonstration reproductibles.

## Prérequis

- Node.js 20 ou une version plus récente
- npm
- Un projet Supabase

## Installation

```bash
npm install
```

## Configuration

Créez un fichier `.env` à la racine du projet avec les informations de
l'API Supabase :

```env
SUPABASE_URL=https://<identifiant>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<clé-service>
```

La clé de service possède des droits étendus. Ne commitez jamais le fichier
`.env` et ne l'utilisez pas côté navigateur.

## Installation du schéma

Dans le tableau de bord Supabase :

1. Ouvrez **SQL Editor**.
2. Copiez le contenu de `schema.sql`.
3. Exécutez le script.


## Liste des commandes

| Commande | Description |
| --- | --- |
| `npm install` | Installe les dépendances du projet. |
| `npm run seed` | Insère les données de démonstration dans Supabase. |
| `npm run seed:dry` | Génère les données sans les envoyer à Supabase. |
| `npm run seed:reset` | Vide les tables prises en charge, puis insère les données. |


