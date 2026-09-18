# MP-11943 — Vendor Portal member invitation e-mails + identity-service extraction (phases 1 + 2)

Epic: https://yatta.atlassian.net/browse/MP-11943 · Branch in every repo: `topic/main/MP-11943_invitation-mails`
Path: architectural (new service, cross-repo contract changes). Written by the `/executor` run of 2026-09-17;
the brainstorming approval gate is collapsed into review of the draft pull requests, because the run is
autonomous (the Will was "execute", the protocol forbids stopping before the bottom).

## 1. Scope

In scope — the epic's phases 1 and 2, in story-map order:

| # | Story | Repos |
|---|-------|-------|
| 1 | MP-11956 bootstrap identity-service | identity-service, gateway, infrastructure |
| 2 | MP-11957 move memberships + portal roles | identity-service, vendor backend, gateway, infrastructure |
| 3 | MP-11944 `MembershipInvited` event | identity-service |
| 4 | MP-11945 MagicLinkIssuer · MP-11946 TemplatedMailSender + MailPurpose · MP-11947 redirect allowlist | marketplace |
| 5 | MP-11949 templates DE/EN | marketplace |
| 6 | MP-11950 consumer composes variant 1 / 2 | marketplace |
| 7 | MP-11951 add-to-existing-account CTA | marketplace, shop-ui |
| 8 | MP-11952 portal landing state, placeholder removal, richer activate result | portal, gateway, identity-service |
| 9 | MP-11953 login hint prefill | gateway, shop-ui, portal |
| 10 | MP-11954 e2e both variants | shop-ui (web-checkout-test) |

Out of scope, by the epic's own gating: MP-11958 (auth core move; "phase 3") and MP-11959 (account split;
"do not start before phase 3 is stable in production"). Offboarding is out of scope by the epic.

Environment limits that bound this delivery (facts, not choices):

- `@yattasolutions/*` npm packages (portal, shop-ui) come from private GitHub Packages; the session's
  token is a proxy sentinel, so **portal and shop-ui cannot be installed, linted or tested locally**.
  Their changes are written test-first and verified by CI on the draft pull requests.
- The e2e specs (MP-11954) need a stage environment running identity-service. None exists yet, so the
  specs are authored and wired into the suite but not run in this delivery.
- The Maven wrapper cannot download behind the proxy; the system Maven 3.9 with Temurin 25 is used.

## 2. Verified current state (what the reports established beyond the epic text)

- **Vendor backend** (`com.yatta.platform.vendor`): modules `audit`, `authorization` (OpenFGA, no
  production caller), `memberships`, `platform` (OPEN), `portalroles`, `views`. `audit` imports
  `memberships.{InviteOutcome,Membership,MembershipId}` and maps only `member.invited`/`member.joined`
  → the whole audit module belongs to memberships and moves. `views` needs `platform/identity` (EndUserId)
  and `platform/id`, `platform/problem`, `platform/events` → those stay in the vendor backend and are
  **copied** into identity-service (the epic says "move"; both services need them). `MembershipService`
  is not `@Transactional`; the only `Clock` bean lives in `MembershipConfiguration`. Flyway V0004–V0007
  build `memberships` + `portal_role_grants`; V0002 is the Modulith `event_publication` outbox.
  `@Externalized` precedent is JSON only (`SavedViewEvent`); Avro lives in an isolated `KafkaTemplate`
  in `AuditConfiguration` precisely because a global Avro serializer would break JSON externalization.
  No `X-Gateway-Client` check anywhere. No schema-registry maven plugin; `auto.register.schemas=false`,
  `use.latest.version=true` on the audit lane (audit-service owns that subject).
- **Gateway**: `vendorBackendApiClient` bean (`PlatformConfig:111-121`) injected by field name into
  `InternalMembershipClient`, which serves `invite`, `list` (used by `members` merge) and `activate`.
  `activate: Boolean!` at `schema.graphqls:246`, described as "deliberately not explained".
  `SchemaShapeRegressionTest` pins nothing about membership yet. `ContinueToAuthorizationRequestResolver`
  is the hook for `login_hint` (an `additionalParameters` entry, not an attribute). Jackson 3.
  `CONTEXT.md` says the account namespace is "not a gateway concept since MP-11316".
- **Marketplace application-boot**: Spring Boot 4.0.6, no Modulith, no ArchUnit, Kafka producer only
  (`KafkaTemplate<String,Object>` auto-configured, global `KafkaAvroSerializer`, `auto.register.schemas=true`,
  `spring.kafka.listener.type=batch`, **no consumer properties**), Avro classes generated into
  `src/main/java` and committed. Target packages are `com.yatta.platform.<domain>`; `de.yatta.*` is
  legacy and **not component-scanned** — the epic's `de.yatta.platform.identity.invitations` cannot work
  there. Magic-link issuance is split: token rows in `AuthenticationInitiationServiceImpl` (legacy
  `security.service.impl`), link rendering in `PlatformAccountMailServiceImpl.createMagicLink` (legacy
  `applicationboot.app.mailing.account.impl`) behind a `@TransactionalEventListener`.
  `AuthenticationEmailTemplateResolver` builds `authentication/{env}/{channel}/{flow}/{signin|signup}/`.
  `RedirectAnchor` comes from the `Redirect-Anchor` request header (request-scoped; a Kafka listener has
  none). `returnUrlPath` is never used as a URL server-side; it is JSON-embedded in a `RedirectRequest`
  row and interpreted by the frontend. Copilot rules: two-commit migration for every legacy class
  touched, granular Lombok, `TimeProvider`, JSpecify, reentrance-safe Flyway, `mvn spotless:apply`.
- **Portal**: `activateMembership()` resolves `granted | refused | failed`; its doc comment forbids
  wording a screen around a refusal cause *because the schema cannot tell them apart* — a new field lifts
  that constraint. `?invited=1` has no producer. `showToast` no-ops before `<ToastContainer>` mounts, so
  a boot-time toast would be dropped. A refused activation leaves the user on the
  `vendor-scope-unavailable` screen, never on `/members`. `FLOW_PATHS` and `Breadcrumbs` reference the
  placeholder routes; `session.denied.areas.team` is only used by the placeholder page. Second catalog
  set `en_US/`, `de_DE/` is unreferenced by code and CI.
- **Infrastructure**: tfvars live in `platform-services/{stage,preview,production}.tfvars`; no
  data-migration precedent; the only reach into the private RDS is the `postgres-db-setup` kubectl Job.
- **shop-ui**: `AuthenticationContext = 'SIGN_IN' | 'SIGN_UP'`; `confirm-authentication-startup.guard.ts`
  coerces anything else to `SIGN_IN`; `AssignedEmailParams` has no `redirect`; add-email prefill arrives
  idiomatically as modal data via `PortalNavigationService.openModalOn`. `login_hint` is absent.
  web-checkout-test provisions only through admin HTTP endpoints, never the database.

## 3. Design principles (from the epic, applied)

1. Event-driven: identity-service publishes `MembershipInvited`; the marketplace composes the mail.
2. Composition: `MagicLinkIssuer`, `TemplatedMailSender`, `MailPurpose`, `RedirectTargetPolicy` are
   injectable collaborators; the invite mail is a new composition.
3. No invite token: the magic link proves e-mail ownership; activation stays e-mail-match.
4. Fail closed on redirects: portal targets validated against an allowlist mirroring `ContinueToPolicy`.
5. Move code once: identity code lands in identity-service; marketplace invitation code is one verified
   Modulith module.
6. Same stack: Modulith verification in every service touched; granular Lombok in marketplace,
   identity-service and gateway; vendor-backend-origin code stays Lombok-free.

## 4. identity-service (MP-11956, MP-11957, MP-11944)

### 4.1 Repository shape

`de.yatta.platform.identity-service`, Maven GAV `de.yatta.platform:identity-service`, Java package
`de.yatta.platform.identity`, Spring Boot 4.1.0 + Modulith 2.1.0 (same as vendor backend), Lombok
(gateway's `lombok.config`), Flyway, Avro, Testcontainers, `spring-boot-cicd.yml@v1.19.1` with Java 25.
Ports: 8080/8081 in k8s; local profile 8097 (management 8098) — the next free slot after
vendor-backend 8095/8096, recorded in the gateway `application-local.yml` port-band comment.

Modules (direct subpackages of `de.yatta.platform.identity`):

| Module | Contents | Origin |
|--------|----------|--------|
| `platform` (OPEN) | `identity/{EndUserId, EndUserIdArgumentResolver, EmailMatchKey, MissingIdentityException, InvalidIdentityException, WebConfig, GatewayClientFilter}`, `id/PublicIdCodec`, `problem/*`, `events/IncompleteEventResubmitter`, `marketplace/*` (client), `audit/{Audited, AuditEventNames, AuditableOutcome}` | copied from vendor backend (package rename only) |
| `memberships` | entity, service, repository, `api/*`, `events/{MembershipInvitedEvent, MembershipInvitedAvroMapper, KafkaExternalizationConfiguration}` and the generated Avro class | moved from vendor backend (+ new `events`) |
| `portalroles` | as in vendor backend | moved |
| `audit` | `internal/*`, Avro `platform.audit.v1-value.avsc` | moved |

`@Modulithic(systemName = "IdentityService")`; `ModularityTests` runs `verify()` and the `Documenter`.

**New:** `GatewayClientFilter` (`OncePerRequestFilter`, in `platform/identity`) answers 401
`authentication_error` unless `X-Gateway-Client: platform-gateway` is present; actuator paths are exempt.
Moved MockMvc tests gain that header (the only permitted change to moved tests; recorded per test).

### 4.2 Database

Own logical DB `identity` on the shared integration RDS. Flyway is written fresh for the new database
rather than replaying vendor-backend history (decision: a fresh database has no history to preserve, and
V0005 already reverses V0004 columns):

- `V0001__event_publication_registry.sql` (verbatim copy of vendor V0002)
- `V0002__create_memberships.sql` — final shape of V0004+V0005 (no `match_email`, no revocation columns,
  `uq_memberships_vendor_email ON (vendor_namespace, LOWER(email))`, `idx_memberships_email`)
- `V0003__create_portal_role_grants.sql` — final shape of V0006+V0007 (`role IN ('ADMIN','VIEWER')`, trigger)

Data migration: `docs/MP-11957-data-migration.md` in the identity-service repo — a
kubectl Job (`postgres:17-alpine`, same mechanism as `postgres-db-setup`) running `pg_dump --data-only
-t memberships -t portal_role_grants` from `vendor` and `psql` into `identity`, with row-count
verification, run at cut-over. Vendor-backend tables are dropped one release later (follow-up ticket,
not in this delivery).

### 4.3 Gateway seam

- `PlatformConfig`: `@Bean RestClient identityServiceApiClient(...)` with
  `${platform-gateway.identity-service.base-url:http://identity-service.integration:8080}` and the
  existing `VendorBackendEndUserHeaderInterceptor` (same header contract; the class keeps its name, its
  javadoc gains the second lane).
- `application.yml` / `application-local.yml` / `README.md` config table: the new property, local
  `http://localhost:8097`.
- `InternalMembershipClient`: the field becomes `identityServiceApiClient`; all three routes move
  (the `members` merge uses `list`). Rollback = revert the property.
- `docs/graphql-api.md` upstream table and `CONTEXT.md` Membership entry updated.

### 4.4 `MembershipInvited` (MP-11944)

Avro schema `src/main/resources/avro/platform.identity.membership.v1-value.avsc`, record
`MembershipInvited`, namespace `de.yatta.platform.identity.memberships.avro`, fields:
`membership_id` (string, `mbr_` TypeID), `vendor_namespace`, `email` (as entered), `invited_by_account_id`
(`acct_` TypeID), `locale` (string, BCP-47 language; default `"en"`), `expires_at` (long, epoch ms),
`occurred_at` (long, epoch ms), `idempotency_key` (string). No token, no role. Field names are
snake_case, like `platform.audit.v1`. The schema file's `doc` fields are the consumer contract.

Domain event: `record MembershipInvitedEvent(String membershipId, String vendorNamespace, String email,
String invitedByAccountId, String locale, Instant expiresAt, Instant occurredAt, String idempotencyKey)`,
annotated `@Externalized("platform.identity.membership.v1")` (no key expression — Modulith evaluates the
SpEL against the *mapped* payload; the key comes from `.routeKey(MembershipInvitedEvent.class,
MembershipInvitedEvent::membershipId)` in the externalization configuration). It is published with
`ApplicationEventPublisher` from the per-address write in `MembershipService`, for both the fresh-invite
and the renewal branch. `invite()` stays non-transactional (it holds a marketplace HTTP call and relies on
catching `DataIntegrityViolationException` per address — a request-wide transaction would be marked
rollback-only); instead each address's write + publish runs inside `TransactionOperations.execute(...)`,
so the outbox row shares that address's transaction. `idempotencyKey = membershipId + ":" +
occurredAt.toEpochMilli()` — a renewal is a new key, a redelivered record is the same key.

Locale: the vendor backend never knew a locale, but the portal's `InviteEmailsModal` already hands
`{ emails, locale }` to `onInvite` and `MembersClient` drops the locale today. So: `InviteRequest` gains an
optional `locale` (BCP-47 language, default `en`, validated against `en|de`), the gateway
`MembershipInviteInput` gains `locale: String` (optional), `InternalMembershipClient.invite` forwards it,
`inviteMembers(emails, locale)` in the portal sends it, and `MembershipService.invite(actingUser, emails,
locale)` stamps it on the event. Absent = `en` at every hop.

Externalization (in `memberships/events`): `EventExternalizationConfiguration` bean with
`.select(annotatedAsExternalized()).routeKey(MembershipInvitedEvent.class, MembershipInvitedEvent::membershipId)
.mapping(MembershipInvitedEvent.class, MembershipInvitedAvroMapper::toAvro)`. Spring Modulith's Kafka lane
normally pre-serializes every payload to JSON bytes (`KafkaJacksonConfiguration`, on by default) — that is
why the vendor backend's JSON events need no serializer config, and why an Avro payload would never reach
an Avro serializer. identity-service therefore sets `spring.modulith.events.kafka.enable-json: false` and
configures Boot's producer with `spring.kafka.producer.value-serializer: io.confluent.kafka.serializers.KafkaAvroSerializer`
and `spring.kafka.producer.properties.auto.register.schemas: true` (identity-service owns its own subject;
the audit lane keeps its private template with `auto.register.schemas=false`, audit-service owns that subject).
The `AuditConfiguration` warning about a global Avro serializer is reworded in the moved class: it applied
to a service that also externalized JSON; identity-service externalizes nothing but Avro. ADR 0001 records
this.

Tests: `MembershipServiceTest` gains publish/no-publish cases (Mockito `ApplicationEventPublisher`);
`MembershipInvitedEndToEndIT` (Postgres + `apache/kafka-native` containers, `schema.registry.url=mock://identity-it`
so `KafkaAvroSerializer`/`KafkaAvroDeserializer` share an in-memory registry) drives
`POST /memberships/invite` twice (fresh + renewal after expiry via a short TTL property) and asserts two
Avro records keyed by `membership_id`, none for a refused address; rollback case covered by a service
test that throws after the publisher call and asserts no publication (Modulith registers the publication
in the same transaction — verified via `EventPublicationRegistry` in the IT).

### 4.5 Vendor backend after the move

Delete `memberships/**`, `portalroles/**`, `audit/**`, `platform/audit/**`, `platform/marketplace/**`,
`authorization/**` (dormant OpenFGA), their tests, the Avro schema, `MembershipInviteRoleGateIT`,
`AuditedAspectTest`, `AuditConfigurationTest`; move the `Clock` bean to `platform/PlatformConfiguration`;
drop the `openfga`, `resilience4j`, `kafka-avro-serializer`, `spring-boot-starter-aspectj` dependencies
and the `avro-maven-plugin`; drop `audit.*`, `openfga.*`, `resilience4j.*`, `marketplace.*`,
`memberships.*` properties; README/CONTEXT.md/`docs/implementation-notes.md` updated. Flyway V0004–V0007
stay untouched (applied history; the tables are dropped one release later by a follow-up ticket, so no
migration is added now). `ModularityTests` still green.

## 5. Marketplace (MP-11945, MP-11946, MP-11947, MP-11949, MP-11950, MP-11951)

### 5.1 Package plan and the two-commit rule

New code lives in target packages:

| Package | Classes |
|---------|---------|
| `com.yatta.platform.account.magiclink` | `MagicLinkIssuer` (interface), `DefaultMagicLinkIssuer`, `MagicLink` (record: `dataId`, `secret`, `url`, `expiresAt`), `RedirectTarget` (record: `path`) |
| `com.yatta.platform.account.redirect` | `RedirectTargetPolicy`, `RedirectTargetProperties` (`@ConfigurationProperties("account.redirect-target")`: `portal-origin`, `locales`, `max-length`) |
| `com.yatta.platform.mail.template` | `TemplatedMailSender`, `MailTemplate` (record: `templatePath`, `from`), `MailPurpose` (enum), `Recipient`, `Sender` (records), `MailModelContributor` (interface), `AuthenticationEmailTemplateResolver` (migrated) |
| `com.yatta.platform.mail.service` | `PlatformAccountMailServiceImpl` (migrated) |
| `com.yatta.platform.account.service` | `AuthenticationInitiationServiceImpl` (migrated) |
| `com.yatta.platform.account.dto` | `AuthenticationAutostartContext` (migrated enum, gains `ADD_EMAIL`) |
| `com.yatta.platform.invitation` | `event/MembershipInvitedListener`, `event/MembershipInvitedMessage`, `service/InvitationMailComposer`, `service/AddToAccountLinkBuilder`, `service/InvitationVariantResolver`, `entity/ProcessedInvitation`, `repository/ProcessedInvitationRepository`, `config/InvitationKafkaConfiguration`, `config/InvitationMailProperties`, `package-info` (`@ApplicationModule(allowedDependencies = {"mail", "account", "vendor", "shared"})`) |

Every legacy class that changes behaviour (`AuthenticationInitiationServiceImpl`,
`PlatformAccountMailServiceImpl`, `AuthenticationEmailTemplateResolver`, `AuthenticationAutostartContext`)
is migrated per §1.3: **Commit 1** = `git mv` + package line only; **Commit 2** = refactor with a
`@Deprecated(forRemoval = true)` stub at the old location keeping the Spring stereotype (the enum is the
"delete" case — enums cannot be stubbed — so its six importers are updated). The mandatory pause after
Commit 1 is collapsed into pull-request review for the same reason as the brainstorming gate; the PR
description carries the §0 gate block for each migration.

Deviation from the epic recorded: the module is `com.yatta.platform.invitation`, not
`de.yatta.platform.identity.invitations` (legacy prefix; not scanned; §1.1 forbids it).

### 5.2 MagicLinkIssuer (MP-11945)

```java
public interface MagicLinkIssuer {
  MagicLink issueSignIn(String email, UUID userUuid, RedirectTarget target, @Nullable VendorContext vendor, Locale locale, RedirectAnchor anchor);
  MagicLink issueSignUp(User user, String email, RedirectTarget target, @Nullable VendorContext vendor, Locale locale, RedirectAnchor anchor);
}
```
`DefaultMagicLinkIssuer` owns what the two legacy classes did between them: `DoubleOptInData` row
(15 min, `KeyGenerator`, `returnUrlPath = target.path()`), or `User.populateNonAcademicAccountConfirmation`
+ `userService.updateUser`, and then `ConfirmEmailRedirectModel` → `RedirectService.buildSecureRedirectUrl(model, anchor)`.
It publishes no mail event. `AuthenticationInitiationServiceImpl` (migrated) calls the issuer for the row and
keeps publishing `SignInMailEvent` / `ConfirmationAccountMailEvent` exactly as today; the listeners in
`PlatformAccountMailServiceImpl` keep calling `createMagicLink` (which now delegates to the same URL
builder the issuer uses) so `/chckout/auth/init` output is byte-identical. `RedirectTarget` is only
constructible through `RedirectTargetPolicy.validate(...)` or `RedirectTarget.unvalidatedFromCheckout(String)`
— the latter is the transitional constructor for the checkout path, whose behaviour MP-11947 must not
change (its javadoc says so).

Tests: `DefaultMagicLinkIssuerTest` (Mockito): row persisted with TTL and returnUrlPath, URL built via
`RedirectService`; plus the existing magic-link integration suites unchanged.

### 5.3 TemplatedMailSender + MailPurpose (MP-11946)

`TemplatedMailSender.send(MailTemplate template, Map<String,Object> model, Recipient to, Sender from,
Locale locale)` lifts `PlatformMimeMessagePreparator` out as a package-private static class
(`TemplatedMimeMessagePreparator`) and keeps the `templatePath + "Subject.vm"` / `"Html.vm"` contract,
`escapeHtml` settings and the subject suffix. It applies every `MailModelContributor` bean
(`Map<String,Object> contribute(Locale)`) before rendering; the existing `tosLink`/`privacyPolicyLink`/
`accountManagementLink` puts become a `StaticPageModelContributor`.

```java
public enum MailPurpose {
  SIGN_IN("authenticate", "signin"), SIGN_UP("authenticate", "signup"),
  PURCHASE_SIGN_IN("purchase", "signin"), PURCHASE_SIGN_UP("purchase", "signup"),
  INVITE_SIGN_IN("invite", "signin"), INVITE_CREATE_OR_ADD("invite", "create-or-add");
  final String flowFolder; final String leafFolder;
}
```
`AuthenticationEmailTemplateResolver.resolveTemplate(RedirectAnchor, VendorContext, MailPurpose, Channel)`
keeps its environment/channel derivation; the legacy `boolean isSignUp` overload stays on the deprecated
stub and maps `true → SIGN_UP`, `false → SIGN_IN` (the purchase flow is still chosen by anchor as today, so
the purchase constants exist for the invite path's `Environment.VENDOR_PORTAL`, `Channel.WEB` fixed
resolution: `resolveInviteTemplate(MailPurpose)` → `authentication/vendorportal/web/invite/<leaf>/`).
Output paths are asserted byte-identical by `AuthenticationEmailTemplateResolverTest` enumerating every
`Environment × Channel × Flow × leaf` folder that must exist on the classpath for `en` and `de`
(`license/` is en-only and out of scope). Rendered-output snapshot: `MailRenderingSnapshotTest` renders
`vendor/web/authenticate/signin|signup` for `en`/`de` through `TemplatedMailSender` with a fake
`MailService` and compares against fixtures under `src/test/resources/mail-snapshots/` captured from the
current output before the refactor (the test is added in Commit 2 of `PlatformAccountMailServiceImpl` with
fixtures generated on the pre-refactor commit).

### 5.4 RedirectTargetPolicy (MP-11947)

Same rules as the gateway `ContinueToPolicy`: path only, ≤ 512 chars, no control chars, no `\`, starts
with `/` not `//`, no scheme/authority, no dot segments (also `%2e`), first segment a configured locale,
fragment dropped, query kept. `validate(String raw) → RedirectTarget` returns the portal root
(`/{defaultLocale}`) on rejection and logs WARN. Configuration `account.redirect-target.portal-origin`
per environment: local `https://portal.yatta.local`, stage/preview/production
`https://portal.<env>.platform.yatta.de`; `locales: en, de`. Applied to the invite path only.
Tests mirror `ContinueToPolicyTest` as a table test.

### 5.5 Templates (MP-11949)

`mail/{en,de}/authentication/vendorportal/web/invite/signin/{Html,Subject}.vm` and
`.../invite/create-or-add/{Html,Subject}.vm`, built from the `solutionportal/web/authenticate/signin`
model: `defaultHead`, `salutation`, body, `yourFriendsFromYatta`, `footerHtml` (`$uuid` required — the
model supplies the invitee's `membershipId` as the footer reference for variant 2, where no account
exists yet, and the user UUID for variant 1). Variables: `$link`, `$addToAccountLink` (rendered under
`#if($addToAccountLink)`), `$vendorName`, `$inviterEmail`, `$expiresAt` (pre-formatted string, locale
aware), `$tosLink`, `$privacyPolicyLink`. Sender `MailConfigProperties.getAccountMail()`. Copy is
placeholder-quality for product review, as the ticket allows; rendered samples are produced by the
snapshot test into `target/mail-samples/` and attached to the PR.

### 5.6 Consumer + composer (MP-11950)

- Dependencies: `spring-modulith-api` (compile: only `@ApplicationModule`) + `spring-modulith-starter-test` (test;
  2.0.x, the Boot 4.0 line — the gateway pins 2.0.0), `spring-kafka-test` (test). Verification is test-only. `ModularityTests`:
  `ApplicationModules.of("com.yatta.platform")` then
  `modules.getModuleByName("invitation").orElseThrow().detectDependencies(modules).throwIfPresent()` — the whole-system
  `verify()` is not run (legacy-era target domains are not yet cycle-free; documented). `mail`, `account`,
  `vendor`, `shared` get `package-info.java` with `@ApplicationModule(type = OPEN)` so their nested
  packages count as API; `invitation` declares `allowedDependencies = {"mail", "account", "vendor",
  "shared"}` — a dependency on `payment`, `licensing`, `purchase`, `billing`, `booking` fails the test.
- Kafka: `InvitationKafkaConfiguration` defines `membershipInvitedListenerContainerFactory`
  (record listener, `KafkaAvroDeserializer` with `specific.avro.reader=false` → `GenericRecord`,
  `ErrorHandlingDeserializer`, group `marketplace-membership-invitations`, `DefaultErrorHandler(new DeadLetterPublishingRecoverer(Map.of(byte[].class → a String/ByteArray template,
  Object.class → the default Avro template), (rec, ex) -> new TopicPartition(rec.topic() + ".dlt", -1)), new FixedBackOff(0, 0))`
  — zero retries, WARN log; raw bytes for a deserialization failure, the `GenericRecord` for a composer failure). Consumer properties are derived from the existing `spring.kafka.properties.*` so SASL and
  registry auth are inherited. The listener is `@ConditionalOnProperty("membership.invitation-mail.enabled")`
  (default off) — a flag off means no consumer group joins and no mail is sent.
- `MembershipInvitedMessage.from(GenericRecord)` maps by field name (no copied `.avsc`, the registry
  is the single source of truth; NullAway-safe).
- `InvitationMailComposer.compose(MembershipInvitedMessage)`:
  1. idempotency: native `INSERT … ON CONFLICT (idempotency_key) DO NOTHING` (`V0381__processed_membership_invitation.sql`)
     as the first statement of the composer's one JPA transaction; 0 rows → redelivered, stop; a send failure rolls
     the row back so the DLT record can be replayed once by an operator. Postgres serialises concurrent inserters.
  2. variant: `userService.findUserByEmail(email)` (the invitability service's own lookup) → known
     activated account = variant 1, else variant 2.
  3. target: `RedirectTargetPolicy.validate("/" + locale + "/members?invited=1&email=" + urlEncode(email))` — the address rides along so an expired link, landing unauthenticated, can prefill the sign-in (MP-11953).
  4. links: the anchor is `UrlBasedRedirectAnchor.of(portalOrigin + target.path(), ...)` — after
     `POST /chckout/redirect/verify` confirms the address, `TokenServiceImpl.updateTokenCookie` sets the
     `YSC` token cookie on the API host, including the `/oauth2` path the authorization server reads, and
     the browser is sent to `redirectRequest.getUrl()` unchanged when `skipAutostart` is set (no `?q=`
     for the Next.js portal to ignore). The portal then has no `gateway_sid`, starts the SSO flow with
     `continueTo=/{locale}/members?invited=1`, the authorization server recognises the cookie and issues
     the code without a screen, and `SessionProvider` activates the membership on landing. This is the
     same cookie mechanics the existing OAuth-anchor magic link relies on
     (`RedirectServiceImpl.getSignInContinuationUrl`). `RedirectController.validateFrontendUrl` is not on
     this path (it guards the deprecated `GET /?q=` endpoint), but the portal origin must still match
     `platform.redirects.host-validation` where that regex is restrictive (production lists `yatta.de`;
     `portal.yatta.de` matches). Variant 1: `MagicLinkIssuer.issueSignIn(email, userUuid, target, null,
     locale, anchor)` with `skipAutostart = true`; variant 2: `issueSignUp` on a freshly created,
     non-activated user (`userService.createUser(false)` + primary address) plus
     `AddToAccountLinkBuilder.build(email, target, locale)`.
  5. model: contributors + `vendorName` (`VendorService.findByNamespaceId`), `inviterEmail`
     (`AccountRepository.findByPublicId(invitedBy)` → primary e-mail), `expiresAt` (formatted with
     `DateTimeFormatter.ofLocalizedDateTime(MEDIUM)` in the mail locale, `TimeProvider` for now).
  6. `TemplatedMailSender.send(resolver.resolveInviteTemplate(purpose), model, to, accountMail, locale)`,
     guarded by `RateLimitingMailInterceptor.track("invitation", email)`.
- Tests: `InvitationMailComposerTest` (Mockito; both variants assert template path and model;
  redelivery sends nothing; rate-limit refusal sends nothing), `MembershipInvitedListenerTest`
  (`@EmbeddedKafka`, `mock://` registry, a GenericRecord round-trip into the listener with a mocked
  composer; a poison record lands on `.dlt`), `ModularityTests`.

### 5.7 Add-to-account CTA (MP-11951)

- `AuthenticationAutostartContext.ADD_EMAIL`. `AddToAccountLinkBuilder` builds a `ConfirmEmailRedirectModel`
  with `context = ADD_EMAIL`, `confirmId = null`, `secret = null`, `email`, `returnPath = target.path()`,
  and `RedirectService.buildSecureRedirectUrl(model, ACCOUNT_MANAGEMENT anchor)`.
- `RedirectController` CONFIRM_EMAIL branch: for `ADD_EMAIL` skip account confirmation and token
  creation; answer the autostart params with `session = null` (the frontend asks for sign-in).
- shop-ui: `AuthenticationContext` gains `'ADD_EMAIL'`; `confirm-authentication-startup.guard.ts`
  preserves it; account-management `AutostartService` routes `confirmEmail`+`ADD_EMAIL` to a new
  `GotoAddEmail({ queryParams: { email }, redirect })` → `NavigationService.openModalOn([GotoAddEmail],
  AddEmailModal)`; `AddEmailComponent` reads modal data `{ email, redirect }` and prefills; without a
  session the existing `GotoSignIn({ redirect })` returns to the same autostart URL. `AssignedEmailParams`
  gains `redirect: string | null` and `getAssignedEmailNavigation` follows it (absolute portal URL allowed
  only when it matches the configured portal origin; else `/profile`). Backend `CONFIRM_ASSIGNED_EMAIL`
  params carry the `returnUrlPath` the add-email registration stored (`addNewEmailToAccountAndAwaitConfirmation`
  gains a `@Nullable String returnUrlPath` parameter; `AccountEmailController.registerNew` accepts an optional
  `redirect` body field validated by `RedirectTargetPolicy`).
- Tests: `AddToAccountLinkBuilderTest`; shop-ui `add-email.component.spec.ts` prefilled case,
  `assigned-email.service.spec.ts` redirect case, `auth-context.state.spec.ts` third member.

## 6. Activation result and portal landing (MP-11952)

- identity-service: `MembershipService.activate` returns `ActivationResult(ActivationReason reason,
  @Nullable Membership membership)` implementing `AuditableOutcome` (replaces `ActivationOutcome`);
  reasons `JOINED`, `ALREADY_MEMBER`, `EXPIRED` (a matching PENDING row whose expiry passed and nothing
  claimable), `NOT_FOUND` (no row, lost claim, grant refused). `ActivationResponse(boolean activated,
  String reason, @Nullable String vendorNamespace)` with wire reasons `none | already_member | expired |
  not_found` (`none` = joined, per the ticket's vocabulary).
- gateway: `MembershipActivationResult { activated: Boolean!, reason: String!, vendor_namespace: String }`,
  field `MembershipActions.activateWithResult: MembershipActivationResult!`; `activate: Boolean!` stays
  and is `@deprecated(reason: "Use activateWithResult")`. `InternalMembershipClient.activate()` returns the
  record; `MembershipService.activate()` likewise; the controller maps `activate` = `result.activated()`.
  `SchemaShapeRegressionTest` gets its first membership pins. The "deliberately not explained" prose in
  `schema.graphqls`, `membership/package-info.java` and `docs/graphql-api.md` is rewritten. `CONTEXT.md`
  Account-namespace entry gets the sentence "it is relayed, not interpreted, in the activation result" and
  ADR-0007 is untouched (the gateway still authorizes nothing).
- portal: `activateMembership()` resolves `{ outcome: 'granted' | 'refused' | 'failed', reason:
  'none' | 'already_member' | 'expired' | 'not_found' | 'unknown' }` using `activateWithResult`; the
  module note and its six tests change accordingly. A tiny external store (`lastActivation`,
  `useLastActivation()` via `useSyncExternalStore`) makes the result readable after boot.
  `MembersClient` renders `<InvitationLandingToast>` (client child under `<Suspense>`; reads
  `useSearchParams().get('invited')`; on mount with `invited=1` and a `granted` result shows one toast
  `members.activation.accepted` (no vendor name — the portal context holds only the id namespace) or `members.activation.alreadyMember`,
  then strips the marker with `history.replaceState`). The `vendor-scope-unavailable` screen in
  `SessionProvider` shows `session.invitationExpired` / `session.invitationNotFound` copy when `invited=1`
  is in the URL and the last activation was refused with that reason (this is where an expired invitee
  actually lands). i18n: `members.activation.*` (not `members.invited.*`, to avoid colliding visually with
  `members.invite.*`) and `session.invitation*`, DE + EN. Deletions: `src/app/[locale]/invite/**`,
  `settings/team/**`, `TeamPageClient`, `placeholders/team.ts`, `placeholders-team.test.ts`, `team.*`,
  `invite.*`, `session.denied.areas.team`; `FLOW_PATHS` loses `/invite`; `Breadcrumbs` regex loses `team`;
  the two tests pinning them change. `en_US/`/`de_DE/` catalogs are left alone (unreferenced; noted).
  `InviteEmailsModal` passes `locale` into `inviteMembers(emails, locale)`; pending/expired facet copy says
  re-inviting is the resend (`members.statusValues.expiredHint`).

## 7. Login hint (MP-11953)

- gateway: `ContinueToAuthorizationRequestResolver` gains a `LoginHintPolicy` (package-private):
  accepts a value ≤ 254 chars matching a pragmatic e-mail pattern (one `@`, no whitespace/control chars);
  valid → `additionalParameters.put("login_hint", value)`; else ignored. Test in `ContinueToCarryTest`
  style.
- authorization-server: unchanged (verified: the raw query string is forwarded).
- shop-ui: `AuthFormEmailGuard` reads `email ?? login_hint`; the `sign-in` route gains
  `AuthFormEmailGuard` before `EmailAuthenticationStartupGuard`; guard spec extended.
- portal: `ssoLoginUrl(continueTo, { loginHint })` (options object, optional; existing positional
  assertions stay valid), `redirectToSso` passes `email` from the current URL when `invited=1` is present.

## 8. e2e (MP-11954)

Four specs in `apps/web-checkout-test/e2e/tests/portal-invitation.spec.ts` (variant 1, 2a, 2b,
negative/resend), using `pollForEmail`, `getMagicLink`-style link extraction, `seedSession`,
`account-email.ts` helpers, unique addresses. New helper `e2e/utils/portal-role-grant.ts`
(`grantPortalAdmin(email, vendorNamespace)`) calls identity-service `PUT /portal-roles/grants`
(the same gateway-header-guarded internal surface) at `process.env.E2E_IDENTITY_SERVICE_URL`; when that
variable is unset the spec `test.skip`s with a message naming it. identity-service therefore gets that
endpoint (idempotent upsert, ADMIN/VIEWER). Branch name identical across repos, per this spec's header.

## 9. Infrastructure (MP-11956)

`platform-services/identity-service.tf` cloned from the vendor backend file: `enable_identity_service`,
`random_password` + Secrets Manager `${env}/identity-service/db-password`, `postgres-db-setup`
(`identity`), `k8s-secret` `identity-service-db-secret`, topic `platform.identity.membership.v1`
(`identity_membership_topic_retention_ms`, default 7 days — a resend must survive a weekend outage) with
`dlq_consumers = { "marketplace-membership-invitations" = { name = "platform.identity.membership.v1.dlt" } }`, service account `kafka-identity-service-sa-${env}` with
write+describe on the topic (and audit topic when enabled), schema-registry read+write on
`platform.identity.membership.v1-value` and read on the audit subject. The marketplace's existing service account (`module.platform_core_service_account` in `dunning-service.tf`, `kafka-platform-core-sa-${env}`) gains read+describe on the topic, write+describe on the `.dlt` and schema-registry read on `…v1-value` plus write on `…v1.dlt-value` (conditional on the flag).
Optional Istio DENY policy `identity-service-internal-mesh-only` (flag off). `stage.tfvars` enables it.
`docs/MP-11957-identity-service-data-migration.md` as in §4.2.

## 10. Testing summary

| Repo | Verified how, in this delivery |
|------|-------------------------------|
| identity-service | `mvn verify` (unit + Testcontainers ITs), `ModularityTests` |
| vendor backend | `mvn verify`, `ModularityTests` |
| gateway | `mvn verify`, `SchemaShapeRegressionTest`, wire tests |
| marketplace | targeted `mvn test -Dtest=...` for the new tests plus the existing auth suites touched (full suite is ~2 h here); `mvn spotless:apply` |
| portal, shop-ui | tests written; run by CI on the draft PR (private packages, see §1) |
| infrastructure | `terraform fmt -check` and `terraform validate` with backend disabled |

## 11. Risks and open items

- Marketplace two-commit migrations of two 300–500-line legacy classes carry the most regression risk;
  they are behaviour-neutral by construction (delegation only) and covered by the existing magic-link
  integration suites, which are run for the touched flows.
- `spring-modulith` in the marketplace is scoped to the one module; a later ticket widens it.
- The e2e specs and the stage rollout of identity-service depend on GitOps manifests in another repo
  (not in scope; noted in the identity-service README).
- The `X-Gateway-Client` check is new; the gateway already sends the header on every internal call.

## 12. Design tree (grill-with-docs, self-resolved from code facts)

Each question is a decision the user would normally take; the run is autonomous, so the recommended
answer was taken and the fact that decided it is named. Reversing any of them is a spec change, not a
code change.

| # | Question | Decision | Deciding fact |
|---|----------|----------|---------------|
| Q1 | Replay vendor-backend Flyway history in identity-service or write the final shape? | Final shape (3 migrations) | A fresh database has no history; V0005 undoes half of V0004 |
| Q2 | Move or copy `platform/identity`, `platform/id`, `platform/problem`, `platform/events`? | Copy | `views/**` (stays) needs `EndUserId`, `ViewId`, problem handling and the resubmitter |
| Q3 | Avro through Modulith's outbox: global Avro serializer, second template, or per-type delegation? | `DelegatingByTypeSerializer` on the Boot `ProducerFactory` | `AuditConfiguration` javadoc documents the regression a global Avro serializer caused; Spring Kafka ships the delegating serializer |
| Q4 | Where does the invitation locale come from? | Portal control → gateway → identity-service → event | `InviteEmailsModal` already emits `{ emails, locale }`; `MembersClient` drops it |
| Q5 | How does a server-made magic link end in the Next.js portal? | URL-based anchor + `skipAutostart`; silent SSO via the `YSC` cookie at `/oauth2` | `TokenServiceImpl.updateTokenCookie`, `RedirectServiceImpl.getResponseParameters` (plain URL when no autostart model) |
| Q6 | Marketplace module package? | `com.yatta.platform.invitation` | `de.yatta.*` is legacy and outside every `@ComponentScan` base package |
| Q7 | Whole-system `ApplicationModules.verify()` in the marketplace? | Only `invitation.verifyDependencies(modules)` plus OPEN markers on `mail`, `account`, `vendor`, `shared` | Legacy-era target domains have no module boundaries yet; the ticket asks for the invitations module to be verified, not the monolith |
| Q8 | `activate` field: evolve or add? | Add `activateWithResult`, deprecate `activate` | GraphQL cannot change `Boolean!` to an object compatibly; wire tests pin the boolean |
| Q9 | Reason vocabulary on the wire? | `none` (joined), `already_member`, `expired`, `not_found` | The ticket's list; `none` keeps `activated=true` cases symmetric |
| Q10 | Where does the invitee see "expired"? | On the `vendor-scope-unavailable` screen, not on `/members` | A refused activation never reaches `/members`; `showToast` is a no-op before the shell mounts |
| Q11 | i18n namespace for the landing copy? | `members.activation.*`, `session.invitation*` | `members.invite.*` already exists; `members.invited.*` would collide visually |
| Q12 | Idempotency: check-then-send or insert-then-send? | Insert first in the sending transaction; failure rolls back | A redelivery must not send twice; a failed send must stay replayable from the DLT |
| Q13 | Copy the `.avsc` into the marketplace or read `GenericRecord`? | `GenericRecord` by field name | Single source of truth is the registry; the audit schema is likewise not registered by the marketplace build |
| Q14 | Two-commit rule for the legacy classes touched? | Followed literally (Commit 1 pure move, Commit 2 refactor, stubs kept); the pause is PR review | `copilot-instructions.md` §1.3 is non-negotiable; the run is autonomous |
| Q15 | `ADD_EMAIL`: new autostart type or new context? | New `AuthenticationAutostartContext` constant, per the ticket; the backend branch skips confirmation | The ticket names the constant and its shop-ui mirror |
| Q16 | e2e provisioning of `portal_role_grants`? | identity-service `PUT /portal-roles/grants` behind the gateway header; specs skip without `E2E_IDENTITY_SERVICE_URL` | web-checkout-test never touches a database; no admin endpoint exists |
| Q17 | Keep the `en_US/` and `de_DE/` catalogs in sync? | Untouched | Unreferenced by code, scripts, docs and CI |
| Q18 | Topic retention? | 7 days (+ `.dlt`) | A resend must survive a consumer outage over a weekend; saved views use 1 day for a different purpose |

Glossary terms introduced (recorded in each repo's `CONTEXT.md` during execution): **Identity service**,
**Invitation mail** (variant 1 sign-in / variant 2 create-or-add), **Activation reason**, **Redirect
target**, **Mail purpose**, **Processed invitation** (idempotency record), **Login hint**.

ADRs to write (all three criteria hold): identity-service `0001-avro-over-modulith-outbox.md`,
`0002-fresh-schema-not-replayed-history.md`, `0003-gateway-client-header-required.md`; marketplace
`docs/adr/000x-invitation-module-verified-in-isolation.md`; gateway
`0011-activation-result-relays-namespace.md`.
