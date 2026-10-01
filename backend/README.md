<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

## Invitations

Le lien envoyé par email pointe vers le front, avec le token dans le
**fragment** : `https://<front>/invite#token=...`. Un navigateur n'envoie
jamais le fragment au serveur : le token n'apparaît donc ni dans les logs du
serveur du front (Next, Vercel), ni dans ceux de Render ou des proxys. La page
lit le fragment, nettoie aussitôt l'URL et l'historique, puis **poste** le token
au backend (`POST /invitations/preview`, puis `POST /invitations/accept` une
fois connecté). Les anciens liens en `?token=` restent acceptés en repli ; le
serveur du front a vu ceux-là, mais l'URL est nettoyée dès la lecture.

## Emails et rappels

Les emails (invitation, rappel d'échéance) partent via SMTP avec Nodemailer.
**L'application démarre et fonctionne sans aucune de ces variables** : si
`MAIL_ENABLED` ne vaut pas `true`, ou si la configuration est incomplète, aucun
transport n'est créé, aucune connexion n'est ouverte, et chaque email est
seulement logué (destinataire et sujet, niveau debug). Une invitation reste
valide et renvoie `emailSent: false`.

| Variable | Rôle |
| --- | --- |
| `MAIL_ENABLED` | `true` pour envoyer réellement ; toute autre valeur désactive l'envoi |
| `SMTP_HOST` | Serveur SMTP (requis si activé) |
| `SMTP_PORT` | Port SMTP (requis si activé) |
| `SMTP_SECURE` | `true` pour TLS implicite (souvent 465), sinon STARTTLS |
| `SMTP_USER`, `SMTP_PASSWORD` | Identifiants, les deux ou aucun |
| `MAIL_FROM` | Adresse d'expédition (requise si activé) |
| `FRONTEND_URL` | Base des liens (`/invite#token=…`, `/boards/:id`), requise si activé |

Le rappel d'échéance tourne toutes les heures : chaque tâche dont la
`dueDate` tombe dans les 24 heures reçoit un seul rappel, envoyé à ses
assignés. Sûr avec plusieurs instances (`FOR UPDATE SKIP LOCKED`, tâches
marquées avant l'envoi). Un OWNER peut déclencher la passe pour son workspace :
`POST /workspaces/:workspaceId/reminders/run` (2 par minute).

## Limitations connues

- **Suppression de compte utilisateur non exposée.** Une suppression directe en
  base retire les adhésions par `CASCADE` et peut laisser un workspace sans
  OWNER : la règle du dernier OWNER est appliquée au niveau service, pas au
  niveau base. Le futur endpoint devra imposer un transfert de propriété ou la
  suppression du workspace.
- **`GET /workspaces/:workspaceId/boards/:boardId/full` en une requête.** Une
  requête unique à jointures multiples (listes, tâches, assignés, utilisateurs)
  produit une duplication de lignes proportionnelle au nombre d'assignés. Choix
  assumé contre le N+1, adapté à l'échelle d'un board Kanban. Au-delà de
  quelques centaines de tâches, scinder en deux requêtes recomposées en mémoire.
- **Compteurs de `DELETE /workspaces/:id` indicatifs.** Les compteurs renvoyés
  (`deletedBoards`, `deletedLists`, `deletedTasks`, `deletedMembers`) sont
  indicatifs. Le verrou `FOR UPDATE` posé sur le workspace empêche la création
  concurrente de boards, mais pas celle de listes ou de tâches dans un board
  existant : sous forte concurrence, les chiffres peuvent être légèrement
  sous-évalués. Ils servent à informer l'utilisateur de l'ampleur de la
  suppression, pas de garantie transactionnelle. Verrouiller l'ensemble du
  sous-arbre pour rendre ces compteurs exacts bloquerait des écritures
  légitimes, arbitrage jugé défavorable.
- **Sémantique du déplacement.** Le client envoie les identifiants des voisins,
  mais le serveur ancre la position sur l'écart réellement adjacent en base
  (juste après `previous`, ou juste avant `next` s'il est seul). Si l'état du
  client est périmé et que des éléments se sont insérés entre les deux voisins
  déclarés, l'élément atterrit immédiatement après `previous` et non à
  l'emplacement visuellement ciblé. Ce choix garantit l'unicité des positions
  sous concurrence. Le client doit se réaligner sur la position renvoyée par la
  réponse plutôt que sur son état local.
- **Invitations expirées et index partiel.** L'index unique partiel sur
  (`workspaceId`, `email`) filtre sur `acceptedAt` et `revokedAt`, un index
  Postgres ne pouvant pas dépendre de `now()`. Une invitation expirée reste donc
  « en attente » pour l'index tout en étant absente du GET, ce qui bloquerait
  définitivement l'email. Contournement retenu : à la création d'une nouvelle
  invitation, toute invitation expirée pour le même email est automatiquement
  révoquée. La ligne est conservée comme trace.
- **Ordre des contrôles à l'acceptation.** La validité du token (404) est
  vérifiée avant la correspondance d'email (403). Le porteur d'un token volé
  apprend donc que le token est valide avant de se voir refuser l'accès.
  Asymétrie assumée : l'ordre inverse ferait du 403 une confirmation
  d'existence du token. Les deux ordres fuitent une information, celui-ci est
  le moins exploitable puisque l'attaquant détient déjà le token.
- **Rate limiting en mémoire, par instance.** Les compteurs de
  `@nestjs/throttler` vivent dans la mémoire du process : avec plusieurs
  instances Render, la limite effective est multipliée par leur nombre. Un
  stockage partagé (Redis) sera nécessaire au passage à plusieurs instances.
  L'IP client est lue avec `trust proxy = 1` (un seul proxy devant l'app) : à
  revalider si l'infrastructure ajoute un saut (CDN devant Render).
- **Cron et free tier Render.** Sur le free tier, le service s'endort après
  une période d'inactivité, et le cron ne s'exécute pas pendant le sommeil. Ce
  n'est pas un bug applicatif mais une contrainte d'hébergement : les tâches
  dont l'échéance tombe pendant le sommeil peuvent ne jamais recevoir de
  rappel. L'endpoint `POST /workspaces/:workspaceId/reminders/run` permet de
  déclencher le traitement à la demande.
- **Aucun retry en cas d'échec SMTP.** Un email perdu est perdu : pour un
  rappel, `reminderSent` reste à `true` (marqué avant l'envoi, pour ne jamais
  envoyer de doublon) ; pour une invitation, `emailSent` vaut `false` et le
  token reste utilisable. Un mécanisme de retry relève d'une file de messages,
  hors périmètre.
- **Envoi synchrone de l'invitation.** La réponse de `POST …/invitations`
  attend l'envoi pour renseigner `emailSent` (après le COMMIT, jamais dedans).
  Un SMTP lent ralentit donc cette requête, dans la limite des timeouts
  configurés (10 s de connexion, 20 s de socket).

- **Cookie tiers et Safari.** Avec le front et l'API sur deux domaines
  distincts (Vercel et Render), le cookie de session est un cookie tiers.
  Safari le bloque par défaut : la connexion y sera impossible. Deux issues :
  héberger les deux sous un même domaine parent (`app.` et `api.` d'un même
  nom), ce qui rend le cookie first-party et permet `SameSite=Lax` ; ou faire
  passer les appels par un rewrite Next, au prix d'un saut réseau
  supplémentaire. À trancher au déploiement. Les attributs du cookie suivent le
  schéma de `FRONTEND_URL` (https : `Secure` + `SameSite=None` ; http : `Lax`),
  et la politique retenue est loguée au démarrage (`[Auth] Session cookie: …`).
- **CSRF.** Avec `SameSite=None`, une requête POST sans corps peut être
  déclenchée depuis un autre site : CORS empêche de lire la réponse, pas
  d'exécuter la requête. `POST /auth/logout` et
  `POST /workspaces/:id/reminders/run` sont concernés. Un hébergement sous
  domaine commun ramène `SameSite=Lax` et supprime le problème sans protection
  CSRF dédiée.
- **`trust proxy = 1`** suppose exactement un proxy devant l'application. Sans
  proxy (en développement), un client peut forger `X-Forwarded-For` et
  contourner le rate limiting — ce que la collection Bruno exploite
  volontairement pour simuler des clients distincts. Avec deux proxys, par
  exemple un CDN devant Render, tous les utilisateurs partageraient la même
  limite. À revérifier au déploiement.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
