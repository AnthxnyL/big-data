-- =====================================================================
--  Schéma e-commerce — Supabase (PostgreSQL 15+)
--  À exécuter dans : Supabase Dashboard > SQL Editor (ou via migration)
--
--  Notes :
--   * "user" et "order" sont des mots réservés en SQL : ils sont donc
--     toujours entre guillemets. Côté supabase-js : .from('user'), .from('order').
--   * Les colonnes uuid[] du schéma sont conservées telles quelles.
--     PostgreSQL ne sait pas poser de clé étrangère sur un tableau :
--     leur cohérence est assurée par l'application (et par le seeder).
--   * Les références circulaires (user <-> basket, user <-> address)
--     sont ajoutées en fin de script ; user.basket_id et
--     user.default_address sont nullables pour pouvoir insérer
--     l'utilisateur avant son panier et son adresse.
--   * timestamp -> timestamptz (bonne pratique Supabase).
-- =====================================================================

-- ---------------------------------------------------------------------
--  Nettoyage (permet de relancer le script). À COMMENTER EN PRODUCTION.
-- ---------------------------------------------------------------------
drop table if exists public.promo_code_usage cascade;
drop table if exists public.promo_code_users_allowed cascade;
drop table if exists public.order_item  cascade;
drop table if exists public."order"     cascade;
drop table if exists public.order_address cascade;
drop table if exists public.basket_item cascade;
drop table if exists public.promo_code  cascade;
drop table if exists public.discount    cascade;
drop table if exists public.basket      cascade;
drop table if exists public.address     cascade;
drop table if exists public."user"      cascade;
drop table if exists public.price       cascade;
drop table if exists public.variant     cascade;
drop table if exists public.product     cascade;
drop table if exists public.category    cascade;
drop table if exists public.brand       cascade;
drop type  if exists public.order_state;
drop type  if exists public.currency;
drop function if exists public.set_updated_at();

-- ---------------------------------------------------------------------
--  Types énumérés
-- ---------------------------------------------------------------------
create type public.order_state as enum (
  'pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded'
);

create type public.currency as enum ('EUR', 'USD', 'GBP', 'CHF');

-- ---------------------------------------------------------------------
--  Catalogue
-- ---------------------------------------------------------------------
create table public.brand (
  id        uuid primary key default gen_random_uuid(),
  name      varchar(100) not null unique,
  products  uuid[] not null default '{}'
);

create table public.category (
  id              uuid primary key default gen_random_uuid(),
  name            varchar(100) not null,
  products        uuid[] default '{}',
  sub_categories  uuid[] default '{}'
);

create table public.product (
  id           uuid primary key default gen_random_uuid(),
  name         varchar(255) not null,
  description  text not null,
  reference    varchar(50) not null unique,
  categories   uuid[] not null default '{}',
  brand        uuid not null references public.brand (id) on delete restrict,
  variant      uuid[] not null default '{}'
);

create table public.price (
  id          uuid primary key default gen_random_uuid(),
  value       double precision not null check (value >= 0),
  product_id  uuid not null references public.product (id) on delete cascade,
  created_at  timestamptz not null default now(),
  currency    public.currency not null default 'EUR'
);

create table public.variant (
  id           uuid primary key default gen_random_uuid(),
  color        varchar(50) not null,
  size         varchar(20) not null,
  reference    varchar(50) not null unique,
  prices       uuid[] not null default '{}',
  quantity     integer not null default 0 check (quantity >= 0),
  last_prices  uuid[] not null default '{}'
);

-- ---------------------------------------------------------------------
--  Utilisateurs, adresses, paniers
-- ---------------------------------------------------------------------
create table public."user" (
  id               uuid primary key default gen_random_uuid(),
  name             varchar(150) not null,
  email            varchar(255) not null unique,
  password         varchar(255) not null,            -- hash, jamais en clair
  phone            varchar(30)  not null unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  is_active        boolean not null default true,
  addresses        uuid[] not null default '{}',
  default_address  uuid,                             -- FK ajoutée plus bas
  order_list       uuid[] default '{}',
  basket_id        uuid                              -- FK ajoutée plus bas
);

create table public.address (
  id        uuid primary key default gen_random_uuid(),
  street    varchar(255) not null,
  city      varchar(100) not null,
  zip_code  varchar(20)  not null,
  country   varchar(100) not null,
  "user"    uuid references public."user" (id) on delete cascade
);

create table public.basket (
  id      uuid primary key default gen_random_uuid(),
  "user"  uuid not null unique references public."user" (id) on delete cascade
);

create table public.basket_item (
  id           uuid primary key default gen_random_uuid(),
  variants_id  uuid not null references public.variant (id) on delete cascade,
  quantity     integer not null default 1 check (quantity > 0),
  basket_id    uuid not null references public.basket (id) on delete cascade
);

-- ---------------------------------------------------------------------
--  Commandes
-- ---------------------------------------------------------------------
-- Adresse figée au moment de la commande : si l'utilisateur modifie ou
-- supprime son adresse plus tard, la commande garde l'adresse de livraison.
create table public.order_address (
  id        uuid primary key default gen_random_uuid(),
  street    varchar(255) not null,
  city      varchar(100) not null,
  zip_code  varchar(20)  not null,
  country   varchar(100) not null,
  "user"    uuid references public."user" (id) on delete set null
);

create table public."order" (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public."user" (id) on delete set null,  -- null = commande invité
  created_at  timestamptz not null default now(),
  state       public.order_state not null default 'pending',
  address     uuid not null references public.order_address (id) on delete restrict,
  firstname   varchar(100) not null,
  lastname    varchar(100) not null,
  email       varchar(255) not null,
  phone       varchar(30)  not null
);

create table public.order_item (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public."order" (id) on delete cascade,
  variants_id  uuid[] not null default '{}',
  unit_price   double precision not null check (unit_price >= 0),
  quantity     integer not null default 1 check (quantity > 0)
);

-- ---------------------------------------------------------------------
--  Promotions
-- ---------------------------------------------------------------------
create table public.discount (
  id               uuid primary key default gen_random_uuid(),
  code_id          uuid[] default '{}',
  amount_discount  integer not null check (amount_discount between 1 and 100), -- en %
  users            uuid[] not null default '{}',
  products         uuid[] not null default '{}',
  categories       uuid[] not null default '{}',
  "order"          uuid[] not null default '{}'
);

create table public.promo_code (
  id             uuid primary key default gen_random_uuid(),
  code           varchar(50) not null unique,
  discount_id    uuid not null references public.discount (id) on delete cascade,
  end_date       timestamptz not null,
  max_usage      integer default 100 check (max_usage is null or max_usage > 0),
  nb_usage       integer not null default 0 check (nb_usage >= 0),
  check (max_usage is null or nb_usage <= max_usage)
);

create table public.promo_code_usage (
  id             uuid primary key default gen_random_uuid(),
  promo_code_id  uuid not null references public.promo_code (id) on delete cascade,
  user_id        uuid not null references public."user" (id) on delete cascade,
  order_id       uuid not null references public."order" (id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (order_id)          -- un seul code promo par commande
);

-- Codes réservés à certains utilisateurs.
-- Un code sans aucune ligne ici est utilisable par tout le monde.
create table public.promo_code_users_allowed (
  id             uuid primary key default gen_random_uuid(),
  promo_code_id  uuid not null references public.promo_code (id) on delete cascade,
  user_id        uuid not null references public."user" (id) on delete cascade,
  unique (promo_code_id, user_id)
);

-- ---------------------------------------------------------------------
--  Références circulaires
-- ---------------------------------------------------------------------
alter table public."user"
  add constraint user_default_address_fkey
    foreign key (default_address) references public.address (id) on delete set null,
  add constraint user_basket_id_fkey
    foreign key (basket_id) references public.basket (id) on delete set null;

-- ---------------------------------------------------------------------
--  Index (colonnes marquées ❄ dans le schéma + clés étrangères)
-- ---------------------------------------------------------------------
create index order_item_order_id_idx    on public.order_item  (order_id);
create index basket_item_basket_id_idx  on public.basket_item (basket_id);
create index basket_item_variant_idx    on public.basket_item (variants_id);
create index order_user_id_idx          on public."order"     (user_id);
create index order_address_idx          on public."order"     (address);
create index order_address_user_idx    on public.order_address ("user");
create index address_user_idx           on public.address     ("user");
create index price_product_id_idx       on public.price       (product_id);
create index product_brand_idx          on public.product     (brand);
create index promo_usage_code_idx       on public.promo_code_usage (promo_code_id);
create index promo_usage_user_idx       on public.promo_code_usage (user_id);
create index promo_allowed_user_idx     on public.promo_code_users_allowed (user_id);
create index promo_code_discount_idx    on public.promo_code  (discount_id);
create index product_categories_gin     on public.product  using gin (categories);
create index order_item_variants_gin    on public.order_item using gin (variants_id);

-- ---------------------------------------------------------------------
--  updated_at automatique sur "user"
-- ---------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_set_updated_at
  before update on public."user"
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
--  Row Level Security
--  Activée partout (sinon Supabase expose les tables à la clé anon).
--  Le seeder utilise la clé service_role, qui contourne la RLS.
--  Ajoute tes policies selon ton besoin, ex. lecture publique du catalogue :
-- ---------------------------------------------------------------------
alter table public.brand       enable row level security;
alter table public.category    enable row level security;
alter table public.product     enable row level security;
alter table public.price       enable row level security;
alter table public.variant     enable row level security;
alter table public."user"      enable row level security;
alter table public.address     enable row level security;
alter table public.basket      enable row level security;
alter table public.basket_item enable row level security;
alter table public."order"     enable row level security;
alter table public.order_address enable row level security;
alter table public.order_item  enable row level security;
alter table public.discount    enable row level security;
alter table public.promo_code  enable row level security;
alter table public.promo_code_usage enable row level security;
alter table public.promo_code_users_allowed enable row level security;

create policy "Catalogue lisible par tous" on public.brand    for select using (true);
create policy "Catalogue lisible par tous" on public.category for select using (true);
create policy "Catalogue lisible par tous" on public.product  for select using (true);
create policy "Catalogue lisible par tous" on public.price    for select using (true);
create policy "Catalogue lisible par tous" on public.variant  for select using (true);
