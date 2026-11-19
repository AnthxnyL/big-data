-- Défi 1
-- Quel est le montant moyen d'une commande validée dans chaque pays de livraison ? Comparez le nombre de commandes et le chiffre d'affaires.
with commandes as (
  select o.id,
         oa.country,
         sum(oi.unit_price * oi.quantity) as montant
  from "order" o
  join order_address oa on oa.id = o.address
  join order_item oi    on oi.order_id = o.id
  where o.state in ('paid', 'preparing', 'shipped', 'delivered')
  group by o.id, oa.country
)
select country                                                        as pays,
       count(*)                                                       as nb_commandes,
       round(100.0 * count(*) / sum(count(*)) over (), 1)             as part_commandes_pct,
       round(sum(montant)::numeric, 2)                                as chiffre_affaires,
       round((100 * sum(montant) / sum(sum(montant)) over ())::numeric, 1) as part_ca_pct,
       round(avg(montant)::numeric, 2)                                as montant_moyen
from commandes
group by country
order by chiffre_affaires desc;

-- Défi 2
-- Quelles sont les 20 villes au panier moyen le plus élevé, parmi celles ayant au moins 30 commandes ?
with commandes as (
  select o.id,
         oa.city,
         oa.country,
         sum(oi.unit_price * oi.quantity) as montant
  from "order" o
  join order_address oa on oa.id = o.address
  join order_item oi    on oi.order_id = o.id
  where o.state in ('paid', 'preparing', 'shipped', 'delivered')
  group by o.id, oa.city, oa.country
)
select city                             as ville,
       country                          as pays,      
       count(*)                         as nb_commandes,
       round(avg(montant)::numeric, 2)  as panier_moyen,
       round(sum(montant)::numeric, 2)  as chiffre_affaires
from commandes
group by city, country
having count(*) >= 30
order by panier_moyen desc
limit 20;

-- Défi 3 
-- Quels sont les 50 clients avec le plus de commandes payées sur 12 mois ? Affichez aussi leur dépense totale
with commandes as (
  select o.id,
         o.user_id,
         sum(oi.unit_price * oi.quantity) as montant
  from "order" o
  join order_item oi on oi.order_id = o.id
  where o.state in ('paid', 'preparing', 'shipped', 'delivered')
    and o.user_id is not null
    and o.created_at >= now() - interval '12 months'
  group by o.id, o.user_id
)
select u.id,
       u.name,
       u.email,
       count(*)                          as nb_commandes,
       round(sum(c.montant)::numeric, 2) as depense_totale
from commandes c
join "user" u on u.id = c.user_id
group by u.id, u.name, u.email
order by nb_commandes desc, depense_totale desc
limit 50;

-- Défi 4
-- Quelles variantes actives du catalogues n'ont jamais été achetées ?
-- « active » = encore en stock (quantity > 0)
select v.id,
       v.reference,
       p.name      as produit,
       v.color,
       v.size,
       v.quantity  as stock
from variant v
left join product p on v.id = any (p.variant)
where v.quantity > 0
  and not exists (
    select 1
    from order_item oi
    join "order" o on o.id = oi.order_id
    where v.id = any (oi.variants_id)
      and o.state in ('paid', 'preparing', 'shipped', 'delivered')
  )
order by p.name, v.reference;

-- Defi 5
--- Classez les marques par chiffre d'affaires en tenant compte des quantités et des prix réellement payés
with ventes as (
  select p.brand,
         oi.quantity,
         oi.unit_price * oi.quantity as montant
  from order_item oi
  join "order" o on o.id = oi.order_id
  cross join lateral unnest(oi.variants_id) as vid(variant_id)
  join product p on vid.variant_id = any (p.variant)
  where o.state in ('paid', 'preparing', 'shipped', 'delivered')
)
select rank() over (order by coalesce(sum(v.montant), 0) desc)   as rang,
       b.name                                                    as marque,
       coalesce(sum(v.quantity), 0)                              as quantite_vendue,
       round(coalesce(sum(v.montant), 0)::numeric, 2)            as chiffre_affaires,
       round((100 * coalesce(sum(v.montant), 0)
              / nullif(sum(sum(v.montant)) over (), 0))::numeric, 1) as part_ca_pct
from brand b
left join ventes v on v.brand = b.id 
group by b.id, b.name
order by rang, marque;

-- Defi 7
-- Quels clients ayant déjà acheté n'ont rien commandé depuis 180 jours ?
with achats as (
  select user_id,
         count(*)        as nb_achats,
         min(created_at) as premier_achat,
         max(created_at) as dernier_achat
  from "order"
  where user_id is not null
    and state in ('paid', 'preparing', 'shipped', 'delivered')
  group by user_id
)
select u.id,
       u.name,
       u.email,
       a.nb_achats,
       a.premier_achat,
       a.dernier_achat,
       now()::date - a.dernier_achat::date as jours_depuis_dernier_achat
from achats a
join "user" u on u.id = a.user_id
where not exists (                       
  select 1
  from "order" o
  where o.user_id = a.user_id
    and o.created_at >= now() - interval '180 days'
)
order by jours_depuis_dernier_achat desc;

-- Defi 8
-- Quelle catégorie réalise le plus de ventes dans chaque pays ? Un produit peut appartenir à plusieurs catégories
with ventes_categorie as (
  select oa.country,
         c.id                             as category_id,
         c.name                           as categorie,
         sum(oi.quantity)                 as quantite_vendue,
         sum(oi.unit_price * oi.quantity) as chiffre_affaires
  from order_item oi
  join "order" o         on o.id = oi.order_id
  join order_address oa  on oa.id = o.address
  cross join lateral unnest(oi.variants_id) as vid(variant_id)
  join product p         on vid.variant_id = any (p.variant)
  cross join lateral unnest(p.categories)   as pc(category_id)
  join category c        on c.id = pc.category_id
  where o.state in ('paid', 'preparing', 'shipped', 'delivered')
  group by oa.country, c.id, c.name
),
classement as (
  select *,
         rank() over (partition by country order by chiffre_affaires desc) as rang
  from ventes_categorie
)
select country                                  as pays,
       categorie,
       quantite_vendue,
       round(chiffre_affaires::numeric, 2)      as chiffre_affaires
from classement
where rang = 1
order by pays;

-- Defi 18 
-- Quelle est la variation en euros et en poucentage du CA par pays par rapport au mois précédent, y compris les mois à zéro
with ca_mensuel as (
  select oa.country,
         date_trunc('month', o.created_at at time zone 'Europe/Paris')::date as mois,
         sum(oi.unit_price * oi.quantity)                                   as ca
  from "order" o
  join order_address oa on oa.id = o.address
  join order_item oi    on oi.order_id = o.id
  where o.state in ('paid', 'preparing', 'shipped', 'delivered')
  group by oa.country, mois
),
mois as (
  select generate_series(
           (select min(mois) from ca_mensuel),
           date_trunc('month', now() at time zone 'Europe/Paris')::date,
           interval '1 month'
         )::date as mois
),
grille as (                              
  select p.country,
         m.mois,
         coalesce(c.ca, 0) as ca
  from (select distinct country from ca_mensuel) p
  cross join mois m
  left join ca_mensuel c on c.country = p.country and c.mois = m.mois
),
avec_precedent as (
  select country,
         mois,
         ca,
         lag(ca) over (partition by country order by mois) as ca_precedent
  from grille
)
select country                                     as pays,
       to_char(mois, 'YYYY-MM')                    as mois,
       round(ca::numeric, 2)                       as ca,
       round(ca_precedent::numeric, 2)             as ca_mois_precedent,
       round((ca - ca_precedent)::numeric, 2)      as variation_eur,
       round((100 * (ca - ca_precedent) / nullif(ca_precedent, 0))::numeric, 1) as variation_pct
from avec_precedent
order by pays, mois;

-- Defi 19
-- Quelle proportion des clients repasse commande dans les 30, 60 et 90 jouers après leur premier achat ?
with achats as (
  select user_id, created_at
  from "order"
  where user_id is not null
    and state in ('paid', 'preparing', 'shipped', 'delivered')
),
premiers as (
  select user_id, min(created_at) as premier_achat
  from achats
  group by user_id
),
clients as (
  select p.user_id,
         p.premier_achat,
         min(a.created_at) as deuxieme_achat
  from premiers p
  left join achats a on a.user_id = p.user_id and a.created_at > p.premier_achat
  group by p.user_id, p.premier_achat
)
select count(*) as nb_clients,

       count(*) filter (where premier_achat <= now() - interval '30 days') as clients_observables_30j,
       round(100.0 * count(*) filter (where premier_achat <= now() - interval '30 days'
                                        and deuxieme_achat <= premier_achat + interval '30 days')
             / nullif(count(*) filter (where premier_achat <= now() - interval '30 days'), 0), 1) as taux_30j_pct,

       count(*) filter (where premier_achat <= now() - interval '60 days') as clients_observables_60j,
       round(100.0 * count(*) filter (where premier_achat <= now() - interval '60 days'
                                        and deuxieme_achat <= premier_achat + interval '60 days')
             / nullif(count(*) filter (where premier_achat <= now() - interval '60 days'), 0), 1) as taux_60j_pct,

       count(*) filter (where premier_achat <= now() - interval '90 days') as clients_observables_90j,
       round(100.0 * count(*) filter (where premier_achat <= now() - interval '90 days'
                                        and deuxieme_achat <= premier_achat + interval '90 days')
             / nullif(count(*) filter (where premier_achat <= now() - interval '90 days'), 0), 1) as taux_90j_pct
from clients;

-- Defi 20
-- Quelles paires de variantes sont les plus fréquentes dans une même commande ? Comptez chaque paire une fois par commande
with variantes_commande as (       
  select distinct oi.order_id, vid.variant_id
  from order_item oi
  join "order" o on o.id = oi.order_id
  cross join lateral unnest(oi.variants_id) as vid(variant_id)
  where o.state in ('paid', 'preparing', 'shipped', 'delivered')
),
paires as (                        
  select a.order_id,
         a.variant_id as variante_a,
         b.variant_id as variante_b
  from variantes_commande a
  join variantes_commande b
    on b.order_id = a.order_id
   and a.variant_id < b.variant_id
)
select va.reference                     as reference_a,
       pa.name                          as produit_a,
       va.color || ' / ' || va.size     as variante_a,
       vb.reference                     as reference_b,
       pb.name                          as produit_b,
       vb.color || ' / ' || vb.size     as variante_b,
       count(*)                         as nb_commandes
from paires p
join variant va      on va.id = p.variante_a
join variant vb      on vb.id = p.variante_b
left join product pa on p.variante_a = any (pa.variant)
left join product pb on p.variante_b = any (pb.variant)
group by va.reference, pa.name, va.color, va.size,
         vb.reference, pb.name, vb.color, vb.size
order by nb_commandes desc, reference_a, reference_b
limit 20;