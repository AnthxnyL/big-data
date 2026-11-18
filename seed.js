/**
 * Seeder e-commerce pour Supabase
 *
 * Usage :
 *   npm install
 *   node --env-file=.env seed.js           # insère les données
 *   node --env-file=.env seed.js --reset   # vide les tables puis insère
 *   node seed.js --dry-run                 # génère sans rien envoyer (aperçu)
 *
 * .env attendu :
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...       # clé service_role (contourne la RLS)
 *
 * Tous les UUID sont générés côté script : les colonnes uuid[] (product.variant,
 * brand.products, user.order_list, etc.) pointent donc vers de vraies lignes.
 */

import { createClient } from '@supabase/supabase-js';
import { fakerFR as faker } from '@faker-js/faker';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';

const COUNT = 15;
const DRY_RUN = process.argv.includes('--dry-run');
const RESET = process.argv.includes('--reset');

faker.seed(2026); // données reproductibles d'un lancement à l'autre

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
const pick = (arr) => faker.helpers.arrayElement(arr);
const pickSome = (arr, min, max) =>
  faker.helpers.arrayElements(arr, { min, max: Math.min(max, arr.length) });
const pad = (n, len = 4) => String(n).padStart(len, '0');
const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const round2 = (n) => Math.round(n * 100) / 100;

function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(plain, salt, 64).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Données de référence (pour un catalogue crédible plutôt que du lorem ipsum)
// ---------------------------------------------------------------------------
const BRAND_NAMES = [
  'Nordvik', 'Atelier Lumen', 'Kaori', 'Brume & Co', 'Terracota', 'Vela Sport',
  'Maison Ombre', 'Pioneer Outdoor', 'Lin & Sel', 'Urbano', 'Fjällhem',
  'Cobalt Studio', 'Sable Doré', 'Rivage', 'Mosaïk',
];

// 5 catégories parentes, 10 sous-catégories (index du parent)
const CATEGORY_TREE = [
  { name: 'Vêtements' },
  { name: 'Chaussures' },
  { name: 'Accessoires' },
  { name: 'Sport' },
  { name: 'Maison' },
  { name: 'T-shirts', parent: 0 },
  { name: 'Pulls & Sweats', parent: 0 },
  { name: 'Vestes', parent: 0 },
  { name: 'Baskets', parent: 1 },
  { name: 'Bottines', parent: 1 },
  { name: 'Sacs', parent: 2 },
  { name: 'Casquettes & Bonnets', parent: 2 },
  { name: 'Running', parent: 3 },
  { name: 'Randonnée', parent: 3 },
  { name: 'Linge de maison', parent: 4 },
];

// produit -> sous-catégorie principale, tailles possibles, fourchette de prix
const PRODUCT_TEMPLATES = [
  { name: 'T-shirt col rond en coton bio', cat: 5, sizes: ['XS', 'S', 'M', 'L', 'XL'], price: [15, 35] },
  { name: 'T-shirt oversize brodé', cat: 5, sizes: ['S', 'M', 'L', 'XL'], price: [25, 45] },
  { name: 'Sweat à capuche molletonné', cat: 6, sizes: ['S', 'M', 'L', 'XL', 'XXL'], price: [45, 80] },
  { name: 'Pull en laine mérinos', cat: 6, sizes: ['S', 'M', 'L', 'XL'], price: [70, 140] },
  { name: 'Veste coupe-vent imperméable', cat: 7, sizes: ['S', 'M', 'L', 'XL'], price: [90, 180] },
  { name: 'Doudoune légère sans manches', cat: 7, sizes: ['XS', 'S', 'M', 'L'], price: [60, 120] },
  { name: 'Baskets basses en cuir', cat: 8, sizes: ['38', '39', '40', '41', '42', '43', '44'], price: [80, 150] },
  { name: 'Sneakers montantes en toile', cat: 8, sizes: ['37', '38', '39', '40', '41', '42'], price: [55, 95] },
  { name: 'Bottines Chelsea en daim', cat: 9, sizes: ['38', '39', '40', '41', '42', '43'], price: [110, 210] },
  { name: 'Sac à dos urbain 20 L', cat: 10, sizes: ['Unique'], price: [50, 110] },
  { name: 'Tote bag en lin épais', cat: 10, sizes: ['Unique'], price: [18, 35] },
  { name: 'Bonnet côtelé en laine recyclée', cat: 11, sizes: ['Unique'], price: [20, 40] },
  { name: 'Chaussures de trail amorties', cat: 12, sizes: ['39', '40', '41', '42', '43', '44', '45'], price: [100, 170] },
  { name: 'Chaussettes de randonnée (lot de 3)', cat: 13, sizes: ['35-38', '39-42', '43-46'], price: [15, 30] },
  { name: 'Parure de lit en lin lavé', cat: 14, sizes: ['140x200', '160x200', '200x200'], price: [90, 220] },
];

const COLORS = [
  'Noir', 'Blanc cassé', 'Bleu marine', 'Vert sauge', 'Terracotta', 'Gris chiné',
  'Beige sable', 'Bordeaux', 'Moutarde', 'Kaki', 'Rose poudré', 'Bleu ciel',
];

// France : ville / code postal générés par faker ; autres pays : couples réels
const COUNTRIES = [
  { country: 'France', weight: 9 },
  { country: 'Belgique', weight: 2, cities: [['Bruxelles', '1000'], ['Liège', '4000'], ['Namur', '5000']] },
  { country: 'Suisse', weight: 2, cities: [['Genève', '1201'], ['Lausanne', '1003'], ['Neuchâtel', '2000']] },
  { country: 'Luxembourg', weight: 1, cities: [['Luxembourg', 'L-1118'], ['Esch-sur-Alzette', 'L-4002']] },
  { country: 'Canada', weight: 1, cities: [['Montréal', 'H2X 1Y4'], ['Québec', 'G1R 4P5']] },
];

const DESC_QUALITIES = [
  'Fabriqué au Portugal dans un atelier familial.',
  'Conçu à partir de matières recyclées et certifiées.',
  'Coupe ajustée pensée pour le confort au quotidien.',
  'Finitions soignées et coutures renforcées.',
  'Matière respirante qui sèche rapidement.',
  'Produit en petite série pour limiter les invendus.',
];
const DESC_USAGES = [
  'Idéal pour la ville comme pour le week-end.',
  'Parfait pour les sorties en extérieur, même par temps frais.',
  'Se porte aussi bien seul qu\'en superposition.',
  'Un essentiel intemporel qui traverse les saisons.',
  'Pensé pour accompagner les longues journées actives.',
];
const DESC_CARE = [
  'Lavage en machine à 30 °C.',
  'Lavage à la main recommandé.',
  'Ne pas passer au sèche-linge.',
  'Garantie 2 ans.',
  'Retours gratuits sous 30 jours.',
];

const ORDER_STATES = ['pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded'];

// ---------------------------------------------------------------------------
// Génération en mémoire
// ---------------------------------------------------------------------------
function buildData() {
  // --- Marques
  const brands = BRAND_NAMES.slice(0, COUNT).map((name) => ({ id: randomUUID(), name, products: [] }));

  // --- Catégories
  const categories = CATEGORY_TREE.slice(0, COUNT).map((c) => ({
    id: randomUUID(), name: c.name, products: [], sub_categories: [],
  }));
  CATEGORY_TREE.forEach((c, i) => {
    if (c.parent !== undefined) categories[c.parent].sub_categories.push(categories[i].id);
  });

  // --- Produits, prix, variantes
  const products = [];
  const prices = [];
  const variants = [];

  PRODUCT_TEMPLATES.slice(0, COUNT).forEach((tpl, i) => {
    const brand = brands[i % brands.length]; // chaque marque a au moins un produit
    const sub = categories[tpl.cat];
    const parent = categories[CATEGORY_TREE[tpl.cat].parent];
    const productId = randomUUID();

    const product = {
      id: productId,
      name: `${tpl.name} — ${brand.name}`,
      description: `${tpl.name} signé ${brand.name}. ${pick(DESC_QUALITIES)} ${pick(DESC_USAGES)} ${pick(DESC_CARE)}`,
      reference: `PRD-${pad(i + 1)}`,
      categories: [sub.id, parent.id],
      brand: brand.id,
      variant: [],
    };

    // Historique de prix : un ancien prix (il y a 3 à 12 mois) et le prix actuel
    const current = round2(faker.number.float({ min: tpl.price[0], max: tpl.price[1] }));
    const promoOld = faker.datatype.boolean(0.6); // l'ancien prix est parfois plus élevé
    const old = round2(promoOld ? current * faker.number.float({ min: 1.05, max: 1.3 }) : current * 0.9);
    const currency = faker.helpers.weightedArrayElement([
      { value: 'EUR', weight: 10 }, { value: 'CHF', weight: 2 }, { value: 'USD', weight: 1 }, { value: 'GBP', weight: 1 },
    ]);
    const oldPrice = {
      id: randomUUID(), value: old, product_id: productId, currency,
      created_at: faker.date.past({ years: 1, refDate: faker.date.recent({ days: 90 }) }).toISOString(),
    };
    const currentPrice = {
      id: randomUUID(), value: current, product_id: productId, currency,
      created_at: faker.date.recent({ days: 60 }).toISOString(),
    };
    prices.push(oldPrice, currentPrice);

    // Une variante par produit (15 au total), taille et couleur variées
    const variant = {
      id: randomUUID(),
      color: pick(COLORS),
      size: pick(tpl.sizes),
      reference: `VAR-${pad(i + 1)}`,
      prices: [currentPrice.id],
      quantity: faker.helpers.weightedArrayElement([
        { value: 0, weight: 1 }, // rupture de stock
        { value: faker.number.int({ min: 1, max: 5 }), weight: 2 }, // stock faible
        { value: faker.number.int({ min: 10, max: 250 }), weight: 5 },
      ]),
      last_prices: [oldPrice.id],
    };
    variants.push(variant);

    product.variant.push(variant.id);
    brand.products.push(productId);
    sub.products.push(productId);
    parent.products.push(productId);
    products.push(product);
  });

  // Prix courant de chaque variante (pour les commandes / paniers)
  const priceById = Object.fromEntries(prices.map((p) => [p.id, p]));
  const currentPriceOf = (v) => priceById[v.prices[0]].value;

  // --- Utilisateurs
  const users = Array.from({ length: COUNT }, (_, i) => {
    const sex = faker.person.sexType();
    const firstName = faker.person.firstName(sex);
    const lastName = faker.person.lastName();
    const createdAt = faker.date.past({ years: 3 });
    return {
      id: randomUUID(),
      name: `${firstName} ${lastName}`,
      email: `${slug(firstName)}.${slug(lastName)}${i + 1}@${pick(['gmail.com', 'outlook.fr', 'proton.me', 'free.fr', 'yahoo.fr', 'orange.fr'])}`,
      password: hashPassword('Password123!'),
      phone: `+33 6 ${pad(faker.number.int({ min: 10, max: 99 }), 2)} ${pad(i + 10, 2)} ${pad(faker.number.int({ min: 0, max: 99 }), 2)} ${pad(faker.number.int({ min: 0, max: 99 }), 2)}`,
      created_at: createdAt.toISOString(),
      updated_at: faker.date.between({ from: createdAt, to: new Date() }).toISOString(),
      is_active: faker.datatype.boolean(0.85),
      addresses: [],
      default_address: null,
      order_list: [],
      basket_id: null,
      _first: firstName, // champs internes, retirés avant insertion
      _last: lastName,
    };
  });

  // --- Adresses (une par utilisateur)
  const addresses = users.map((u) => {
    const c = faker.helpers.weightedArrayElement(COUNTRIES.map((x) => ({ value: x, weight: x.weight })));
    const [city, zip] = c.cities ? pick(c.cities) : [faker.location.city(), faker.location.zipCode()];
    const address = {
      id: randomUUID(),
      street: faker.location.streetAddress(),
      city,
      zip_code: zip,
      country: c.country,
      user: u.id,
    };
    u.addresses.push(address.id);
    u.default_address = address.id;
    return address;
  });

  // --- Paniers (un par utilisateur, contrainte unique)
  const baskets = users.map((u) => {
    const basket = { id: randomUUID(), user: u.id };
    u.basket_id = basket.id;
    return basket;
  });

  // --- Articles de panier : 15 répartis aléatoirement (certains paniers vides)
  const basketItems = [];
  const usedPairs = new Set();
  while (basketItems.length < COUNT) {
    const basket = pick(baskets);
    const variant = pick(variants.filter((v) => v.quantity > 0));
    const key = `${basket.id}:${variant.id}`;
    if (usedPairs.has(key)) continue;
    usedPairs.add(key);
    basketItems.push({
      id: randomUUID(),
      variants_id: variant.id,
      quantity: faker.number.int({ min: 1, max: Math.min(3, variant.quantity) }),
      basket_id: basket.id,
    });
  }

  // --- Commandes + adresses de commande + lignes de commande
  // Chaque commande reçoit une copie (snapshot) de l'adresse de livraison.
  // Les 2 dernières commandes sont passées par des invités (user_id = null).
  const GUEST_ORDERS = 2;
  const addressById = Object.fromEntries(addresses.map((a) => [a.id, a]));
  const orderAddresses = [];
  const orders = Array.from({ length: COUNT }, (_, i) => {
    const isGuest = i >= COUNT - GUEST_ORDERS;
    const u = isGuest ? null : pick(users);

    let contact;
    let src;
    if (u) {
      contact = { firstname: u._first, lastname: u._last, email: u.email, phone: u.phone };
      src = addressById[u.default_address];
    } else {
      const firstname = faker.person.firstName();
      const lastname = faker.person.lastName();
      contact = {
        firstname, lastname,
        email: `${slug(firstname)}.${slug(lastname)}.invite${i}@gmail.com`,
        phone: `+33 7 ${pad(faker.number.int({ min: 10, max: 99 }), 2)} ${pad(i, 2)} ${pad(faker.number.int({ min: 0, max: 99 }), 2)} ${pad(faker.number.int({ min: 0, max: 99 }), 2)}`,
      };
      src = { street: faker.location.streetAddress(), city: faker.location.city(), zip_code: faker.location.zipCode(), country: 'France' };
    }

    const orderAddress = {
      id: randomUUID(),
      street: src.street,
      city: src.city,
      zip_code: src.zip_code,
      country: src.country,
      user: u ? u.id : null,
    };
    orderAddresses.push(orderAddress);

    const order = {
      id: randomUUID(),
      user_id: u ? u.id : null,
      created_at: (u ? faker.date.between({ from: u.created_at, to: new Date() }) : faker.date.recent({ days: 200 })).toISOString(),
      state: pick(ORDER_STATES),
      address: orderAddress.id,
      ...contact,
    };
    if (u) u.order_list.push(order.id);
    return order;
  });

  // Chaque commande a au moins une ligne ; quelques commandes en ont deux
  const orderItems = [];
  const lineFor = (order) => {
    const v = pick(variants);
    return {
      id: randomUUID(),
      order_id: order.id,
      variants_id: [v.id],
      unit_price: currentPriceOf(v),
      quantity: faker.helpers.weightedArrayElement([
        { value: 1, weight: 6 }, { value: 2, weight: 3 }, { value: 3, weight: 1 },
      ]),
    };
  };
  orders.forEach((o) => orderItems.push(lineFor(o)));
  pickSome(orders, 3, 5).forEach((o) => orderItems.push(lineFor(o)));

  // --- Remises + codes promo (1 code par remise)
  const discounts = [];
  const promoCodes = [];
  const PROMO_PREFIXES = ['BIENVENUE', 'HIVER', 'SOLDES', 'VIP', 'FLASH', 'NOEL', 'RENTREE', 'BLACKFRIDAY', 'PARRAIN', 'ETE', 'FIDELITE', 'OUTDOOR', 'MAISON', 'SPORT', 'LASTCHANCE'];

  for (let i = 0; i < COUNT; i++) {
    const discountId = randomUUID();
    const scope = i % 4; // 0 = catégories, 1 = produits, 2 = utilisateurs ciblés, 3 = commandes ciblées
    const discount = {
      id: discountId,
      code_id: [],
      amount_discount: pick([5, 10, 10, 15, 15, 20, 25, 30, 40, 50]),
      users: scope === 2 ? pickSome(users, 1, 4).map((u) => u.id) : [],
      products: scope === 1 ? pickSome(products, 1, 4).map((p) => p.id) : [],
      categories: scope === 0 ? pickSome(categories, 1, 3).map((c) => c.id) : [],
      order: scope === 3 ? pickSome(orders, 1, 3).map((o) => o.id) : [],
    };

    const maxUsage = faker.helpers.weightedArrayElement([
      { value: null, weight: 2 }, { value: 1, weight: 1 }, { value: 50, weight: 2 }, { value: 500, weight: 2 },
    ]);
    const expired = faker.datatype.boolean(0.25);
    const promo = {
      id: randomUUID(),
      code: `${PROMO_PREFIXES[i]}${discount.amount_discount}`,
      discount_id: discountId,
      end_date: (expired ? faker.date.recent({ days: 120 }) : faker.date.soon({ days: 180 })).toISOString(),
      max_usage: maxUsage,
      nb_usage: 0, // calculé à partir de promo_code_usage ci-dessous
    };

    discount.code_id.push(promo.id);
    discounts.push(discount);
    promoCodes.push(promo);
  }

  const discountMap = Object.fromEntries(discounts.map((d) => [d.id, d]));
  const discountById = (id) => discountMap[id];

  // --- Codes réservés à certains utilisateurs (promo_code_users_allowed)
  // 6 codes « généraux » (remises sur catégories / produits) deviennent réservés
  // à 1 à 4 clients : codes de parrainage, offres VIP, gestes commerciaux…
  const promoCodeUsersAllowed = [];
  const allowedByCode = {};
  const restrictable = promoCodes.filter((p) => {
    const d = discountById(p.discount_id);
    return !d.users.length && !d.order.length;
  });
  for (const promo of pickSome(restrictable, 6, 6)) {
    const allowed = pickSome(users, 1, 4);
    allowedByCode[promo.id] = allowed.map((u) => u.id);
    allowed.forEach((u) => promoCodeUsersAllowed.push({ id: randomUUID(), promo_code_id: promo.id, user_id: u.id }));
  }

  // --- Utilisations de codes promo (promo_code_usage)
  // Règles respectées : 1 code max par commande, client inscrit, code encore
  // valide à la date de la commande, max_usage non dépassé, client autorisé
  // (promo_code_users_allowed et discount.users), commande ciblée si discount.order.
  // nb_usage = nombre réel d'utilisations.
  const promoCodeUsages = [];
  for (const order of faker.helpers.shuffle(orders.filter((o) => o.user_id))) {
    if (promoCodeUsages.length >= 12) break;
    const eligible = promoCodes.filter((p) => {
      const d = discountById(p.discount_id);
      if (new Date(order.created_at) > new Date(p.end_date)) return false;
      if (p.max_usage !== null && p.nb_usage >= p.max_usage) return false;
      if (allowedByCode[p.id] && !allowedByCode[p.id].includes(order.user_id)) return false;
      if (d.users.length && !d.users.includes(order.user_id)) return false;
      if (d.order.length && !d.order.includes(order.id)) return false;
      return true;
    });
    if (!eligible.length) continue;
    const promo = pick(eligible);
    promo.nb_usage += 1;
    promoCodeUsages.push({
      id: randomUUID(),
      promo_code_id: promo.id,
      user_id: order.user_id,
      order_id: order.id,
      created_at: order.created_at, // le code est utilisé au moment de la commande
    });
  }

  const cleanUsers = users.map(({ _first, _last, ...u }) => u);

  return {
    brands, categories, products, prices, variants,
    users: cleanUsers, addresses, baskets, basketItems,
    orderAddresses, orders, orderItems, discounts, promoCodes, promoCodeUsersAllowed, promoCodeUsages,
  };
}

// ---------------------------------------------------------------------------
// Insertion dans Supabase
// ---------------------------------------------------------------------------
async function insert(supabase, table, rows) {
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw new Error(`[${table}] ${error.message}${error.details ? ` — ${error.details}` : ''}`);
  console.log(`  ✓ ${table.padEnd(25)} ${rows.length} lignes`);
}

const NIL = '00000000-0000-0000-0000-000000000000';

async function reset(supabase) {
  console.log('Suppression des données existantes…');
  // casser les références circulaires avant de supprimer
  const { error: e } = await supabase.from('user')
    .update({ default_address: null, basket_id: null }).neq('id', NIL);
  if (e) throw new Error(`[reset user] ${e.message}`);

  const order = [
    'promo_code_usage', 'promo_code_users_allowed', 'order_item', 'order', 'order_address', 'basket_item', 'promo_code', 'discount',
    'basket', 'address', 'user', 'variant', 'price', 'product', 'category', 'brand',
  ];
  for (const table of order) {
    const { error } = await supabase.from(table).delete().neq('id', NIL);
    if (error) throw new Error(`[reset ${table}] ${error.message}`);
  }
  console.log('  ✓ tables vidées\n');
}

async function main() {
  const data = buildData();

  if (DRY_RUN) {
    for (const [k, v] of Object.entries(data)) console.log(`${k.padEnd(25)} ${v.length}`);
    console.log('\nExemple produit :', data.products[0]);
    console.log('Exemple commande :', data.orders[0]);
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis (fichier .env).');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (RESET) await reset(supabase);

  console.log('Insertion…');
  // Ordre imposé par les clés étrangères
  await insert(supabase, 'brand', data.brands);
  await insert(supabase, 'category', data.categories);
  await insert(supabase, 'product', data.products);
  await insert(supabase, 'price', data.prices);
  await insert(supabase, 'variant', data.variants);

  // user sans default_address / basket_id, puis mise à jour (références circulaires)
  await insert(supabase, 'user', data.users.map((u) => ({ ...u, default_address: null, basket_id: null })));
  await insert(supabase, 'address', data.addresses);
  await insert(supabase, 'basket', data.baskets);
  const { error } = await supabase.from('user').upsert(data.users, { onConflict: 'id' });
  if (error) throw new Error(`[user upsert] ${error.message}`);
  console.log('  ✓ user         liens adresse / panier mis à jour');

  await insert(supabase, 'basket_item', data.basketItems);
  await insert(supabase, 'order_address', data.orderAddresses);
  await insert(supabase, 'order', data.orders);
  await insert(supabase, 'order_item', data.orderItems);
  await insert(supabase, 'discount', data.discounts);
  await insert(supabase, 'promo_code', data.promoCodes);
  await insert(supabase, 'promo_code_users_allowed', data.promoCodeUsersAllowed);
  await insert(supabase, 'promo_code_usage', data.promoCodeUsages);

  console.log('\nSeed terminé ✔  (mot de passe de tous les comptes : Password123!)');
}

main().catch((err) => {
  console.error('\n✗ Échec du seed :', err.message);
  process.exit(1);
});
