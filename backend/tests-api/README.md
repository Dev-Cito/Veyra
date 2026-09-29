# Veyra — Collection de tests API (Bruno)

Suite de tests manuels et automatisables contre l'API Veyra.
**60 requêtes** réparties en 13 dossiers, avec assertions, capture
automatique des identifiants, et le raisonnement de chaque test dans son
bloc `docs`.

---

## Installation

```bash
# Application de bureau
brew install --cask bruno          # macOS

# Runner en ligne de commande
npm install -g @usebruno/cli
```

Dans l'application : **Open Collection** → pointer sur `backend/tests-api`.

---

## Configuration obligatoire

Une seule chose à régler avant la première exécution.

**Preferences → General → décocher « Send cookies automatically ».**

Sans ça, le jar de cookies de Bruno est partagé par domaine : la
connexion de Bob écraserait celle d'Alice, et tous les tests
multi-utilisateurs deviendraient faux.

Cette collection gère les cookies **explicitement** : chaque `register`
capture le `Set-Cookie` dans une variable (`aliceCookie`, `bobCookie`,
`carolCookie`), et chaque requête envoie celle de l'utilisateur qu'elle
incarne. Trois avantages : aucune modification de `/etc/hosts`, la
requête dit visiblement qui elle est, et le comportement est identique
en mode manuel et dans le runner.

En CLI, l'équivalent est le drapeau `--disable-cookies`.

---

## Exécution

```bash
cd backend
docker compose up -d
pnpm start:dev
```

Dans un autre terminal :

```bash
cd backend/tests-api
bru run --env local --disable-cookies -r
```

Contre la production, une fois déployé :

```bash
bru run --env render --disable-cookies -r
```

Le drapeau `-r` active la récursion dans les sous-dossiers.

---

## Les trois tests qui comptent

Si tu ne devais en lancer que trois, ce sont ceux-là. Ils valident
l'architecture de sécurité ; tout le reste est de la conformité.

| Test | Ce qu'il prouve |
|---|---|
| `03-isolation/01` | Un non-membre est arrêté par `WorkspaceGuard` → **403** |
| `06-idor/02` | Un membre légitime d'un autre workspace est arrêté par `WorkspaceScopeService` → **404** |
| `04-invitations/05` | Un token volé ne suffit pas : l'email doit correspondre → **403** |

Le deuxième est le vrai test d'IDOR : Carol passe le garde
**légitimement**, puis se fait arrêter par la vérification
d'appartenance de la ressource. S'il renvoie 200, tout le cloisonnement
du projet est illusoire.

---

## L'ordre des dossiers n'est pas cosmétique

Le runner respecte l'ordre des `seq`. Deux positions sont imposées :

**`03-isolation` avant `04-invitations`.** Bob rejoint WS1 au dossier
04. Une fois membre, on ne peut plus tester le refus opposé à un
non-membre sans créer un quatrième compte.

**`12-rate-limit` en dernier.** Ce dossier brûle volontairement le quota
de l'IP pour une minute. Placé au milieu, tous les dossiers suivants
échoueraient en 429 et tu chercherais un bug inexistant.

À l'intérieur du dossier 04, `05-carol-steals-token` doit précéder
`06-bob-accepts` : l'acceptation consomme le token.

---

## Ré-exécution

Chaque exécution génère un `runId` unique, utilisé comme suffixe des
emails (`alice-<runId>@veyra.test`). La collection est donc rejouable
sans réinitialiser la base.

**Une limite** : l'inscription est plafonnée à **5 requêtes par minute et
par IP**, et la collection en fait 3. Relancer deux fois dans la même
minute produit un 429 sur le troisième `register`. Attendre 60 secondes
— ce n'est pas un bug, c'est la protection qui fonctionne.

---

## Ce que la collection ne couvre pas

Deux propriétés ne se testent pas au client HTTP :

**La concurrence.** Les deadlocks du déplacement croisé, la double
acceptation d'invitation, le `SKIP LOCKED` du cron — tout cela exige des
requêtes réellement simultanées. C'est couvert par la suite e2e
(`pnpm test:e2e`), avec des tests `Promise.all` vérifiés par mutation.

**La réindexation des positions.** Il faut épuiser la précision
flottante en insérant des dizaines de fois au même point. Le script
`scripts/force-reindex.sh` le fait au curl ; le test déterministe vit
dans la suite e2e.

Les deux suites sont complémentaires : e2e pour les garanties internes,
Bruno pour le contrat HTTP réel.

---

## Structure

```
00-baseline      Réinitialisation du runId, 401 sans cookie
01-auth          Inscription des 3 comptes, capture des cookies
02-workspaces    WS1 (Alice) et WS2 (Carol)
03-isolation     Bob non-membre → 403          ⚠ avant le dossier 04
04-invitations   Token, vol de token, révocation, index partiel
05-kanban        Board, 3 listes, 3 tâches, vue /full
06-idor          403 du guard vs 404 du scope  ⚠ le test central
07-rôles         MEMBER → ADMIN, 403 permission vs 409 état
08-moves         Positions flottantes, voisins, no-op, inter-listes
09-assignees     Assignation, doublon, nettoyage au retrait
10-reminders     Fenêtre de 24 h, idempotence du flag
11-validation    Aucune 500 sur entrée utilisateur
12-rate-limit    10 req/min puis 429           ⚠ obligatoirement en dernier
```

---

## Contrôles en base

Certains tests demandent une vérification côté Postgres :

```bash
# L'adhésion OWNER est créée dans la même transaction que le workspace
docker compose exec db psql -U veyra -d veyra -c \
  'SELECT "workspaceId", role, status FROM workspace_members;'

# Le nettoyage des assignations est scopé au bon workspace
docker compose exec db psql -U veyra -d veyra -c \
  'SELECT * FROM task_assignees;'

# Seul le hash des tokens est stocké
docker compose exec db psql -U veyra -d veyra -c \
  'SELECT email, "tokenHash", "acceptedAt", "revokedAt" FROM invitations;'
```
