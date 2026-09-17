# MP-11943 — plan-eng-review notes (gstack plan-eng-review, degraded preamble, autonomous run)

Scope gate: the target is the plan `docs/superpowers/plans/2026-09-17-mp-11943-invitation-mails-identity-service.md` (user-named by the protocol). Two reviewers read plan + spec against the real repositories. Every finding below was either applied to the plan (marked ✔) or rejected with a reason (✘). The plan text is the source of truth after this pass; this file is the audit trail.

## Frontend + infrastructure findings

| # | Finding (short) | Disposition |
|---|-----------------|-------------|
| 1 | `MembersClient.test.tsx` has no `next/navigation` mock; a `useSearchParams` child breaks 30+ tests | ✔ G3: mock `next/navigation` and `InvitationLandingToast` in that file |
| 2 | `SessionProvider.test.tsx:78` mocks the activation module with one export; reading the store from `SessionProvider` breaks ~40 tests | ✔ G3: activation reason rides the `vendor-scope-unavailable` state object; the store stays a members-page concern |
| 3 | Every `'granted'/'refused'/'failed'` string site must become an object (`:139, :681, :706, :732, :753`, `SessionProvider.tsx:368, 372`) | ✔ G3 lists them |
| 4 | `inviteMembers(emails, locale, key)` shifts a positional argument; 7 assertions break | ✔ C1: options object `inviteMembers(emails, { locale, idempotencyKey })`; delete the "locale dropped" comments in `MembersClient.tsx:295-311` and `InviteEmailsModal.tsx:106-113, 432` |
| 5 | No vendor name source in the portal context | ✔ G3/spec §6: copy without a vendor placeholder |
| 6 | `useSyncExternalStore` needs `getServerSnapshot`; test reset hook | ✔ G3 |
| 7 | Toast timing note | ✔ G3 comment in the test |
| 8 | Suspense is mandatory for `next build` | ✔ already in plan; comment added |
| 9 | Exported `stripMarkerFromUrl` vs the session-guard mock enumeration | ✔ G3: move it to `src/lib/url-markers.ts` |
| 10 | `statusValues` is an enum map; use `members.statusHints.expired`; update `docs/i18n.md` namespace list | ✔ G3 |
| 11 | Deletions incomplete: `RequireCapability.test.tsx:66,79`, `CLAUDE.md:93`, `de.json`, `routes.ts` comment + blocked list, `area` is `string` | ✔ G3 |
| 12 | `ssoLoginUrl` 2-arg call with `undefined` fails arity-sensitive assertions; `gateway.test.ts` does not exist | ✔ H3: spread only when set; create the test file |
| 13 | Portal has no `email` in the URL to forward as `login_hint` | ✔ E3/D1: redirect target is `/{locale}/members?invited=1&email=<encoded>`; toast strips both markers; policy table test covers it |
| 14 | `account-router/goto-actions.ts` does not exist; `GotoSignIn` is in `session.actions.ts` | ✔ F2: `account-router/goto-add-email.action.ts` extending `AccountGotoAction`, re-exported from `account-router/index.ts` |
| 15 | `confirmEmail` always reaches `ConfirmAuthenticationStartupGuard` → `CompleteEmailAuthentication` with `confirmId=null`; `ConfirmAuthenticationAutostartParams` has no `email` | ✔ F2: branch in account-management `AutostartService` before delegating; guard only widens the type; F1 adds `email` to `ConfirmEmailAutostartParams`, TS interface gains `email: string \| null` |
| 16 | Modal data via `queryParams`; `ActiveModal<T>.getData()` | ✔ F2 |
| 17 | `AddEmailAddress` body URL is `apiUrl + '/account/email/registerNew'` | ✔ F2 |
| 18 | No `environment.vendorPortalOrigin`; use `PLATFORM_ENVIRONMENT.vendorPortalUrl` via `getEnvironmentRoot('portal')`; `finishWithRedirection` for the cross-origin hop | ✔ F2 |
| 19 | `AssignedEmailParams.redirect` on all three union members; fixtures | ✔ F2 |
| 20 | `AuthFormEmailGuard` ordering + spec helper signature | ✔ H2 |
| 21 | Use `SessionState.isSignedInWithAccount` | ✔ F2 |
| 22 | e2e conventions; direct identity-service provisioning contradicts the gateway-only surface | ✔ conventions applied in I2. Provisioning: kept as the documented interim (skip without `E2E_IDENTITY_SERVICE_URL`); the durable path (an admin-authenticated gateway mutation) is a follow-up ticket named in the e2e doc — no admin authentication exists at the gateway today, and inventing one is out of this epic's scope |
| 23 | Use the topic module's `dlq_consumers` instead of a second module | ✔ A4 |
| 24 | Marketplace SA (`module.platform_core_service_account`, `dunning-service.tf:57-143`) needs read/describe on the topic, write/describe on the DLT and schema-registry read on the subject | ✔ A4 |
| 25 | `DeadLetterPublishingRecoverer` partition mapping vs 1-partition DLT | ✔ E3: destination resolver `new TopicPartition(topic + ".dlt", -1)` |
| 26 | `terraform fmt -check` unconditional; `init -backend=false` best effort | ✔ A4 |
| 27 | Spec §9 says `backend.tf` | ✔ spec fixed |
| 28 | Runbook name `docs/MP-11957-identity-service-data-migration-plan.md` with Jira header | ✔ A4 |
| 29 | Variable description style; tfvars comment | ✔ A4 |

## Java findings

| # | Finding (short) | Disposition |
|---|-----------------|-------------|
| 1 | Modulith 2.1 Kafka lane pre-serializes payloads to JSON `byte[]` (`KafkaJacksonConfiguration`, `kafka-json.properties`); the `DelegatingByTypeSerializer` never sees a `SpecificRecord` | ✔ C2/spec §4.4/ADR 0001: `spring.modulith.events.kafka.enable-json=false`, global `KafkaAvroSerializer` with `auto.register.schemas=true`; no `ProducerFactory` bean; audit lane unchanged |
| 2 | `@Externalized` key SpEL is evaluated on the mapped Avro payload | ✔ C2: `@Externalized("platform.identity.membership.v1")` + `.routeKey(MembershipInvitedEvent.class, MembershipInvitedEvent::membershipId)`; IT asserts the key |
| 3 | `@Transactional invite()` + caught `DataIntegrityViolationException` = rollback-only → 500 | ✔ C2/spec §4.4: `invite()` stays non-transactional; per-address `TransactionOperations.execute` around write+publish; unit tests use `TransactionOperations.withoutTransaction()` |
| 4 | `verifyDependencies` returns `void` | ✔ E2: `detectDependencies(modules).throwIfPresent()` |
| 5 | Generated Avro class is `memberships`-internal; a separate `eventing` module cannot see it | ✔ C2/spec §4.1: configuration + mapper live in `memberships/events`; no `eventing` module |
| 6 | "Event carries the URL" drags two more legacy migrations; `/chckout/auth/init` never returns a URL | ✔ D2/D3: token/render split per spec §5.2; `MagicLink(dataId, secret, url, expiresAt)` stays |
| 7 | Idempotency `existsBy`+`save` races and sends twice | ✔ E3: native `INSERT … ON CONFLICT (idempotency_key) DO NOTHING` returning rows, in the composer's one JPA transaction; 0 → redelivered, return |
| 8 | DLT publishing through the Avro template hits the registry; SA lacks ACLs | ✔ E3: `DeadLetterPublishingRecoverer(Map<Class<?>,KafkaOperations>)` with a `ByteArraySerializer` template for `byte[]` and the default template for `GenericRecord`; resolver `TopicPartition(topic+".dlt", -1)`; A4 adds registry write on `…dlt-value` for the marketplace SA |
| 9 | Use `spring-modulith-api` (compile) + `starter-test` (test) in the marketplace | ✔ E2 |
| 10 | `GatewayClientFilter` constructor dependency breaks `@WebMvcTest` slices | ✔ A2: `@Value("${identity.gateway-client.required:true}")`; header added to every HTTP test incl. the new IT |
| 11 | Stub constructor must re-declare `@Autowired(required=false) @Nullable UserCheckService` | ✔ D3 |
| 12 | `AccountRegistrationService` interface migrates too; impl is `@Named` | ✔ F1 |
| 13 | D5 stub keeps `@Component("platformAccountMailService")` and the concrete legacy type (qualifier injection in `AccountEmailController:63`) | ✔ D5 |
| 14 | Portal role upsert must normalize e-mail (`CHECK` constraint) and needs a new repository finder | ✔ I1 |
| 15–27 | Confirmations (APIs exist, nullability matches, `@deprecated` fine, container factory approach fine, field naming, deletion set, ports, `@Pattern` null-safe, `RateLimitingMailInterceptor` target copy, D4 delete-case option, `mock://` registry) | ✔ noted; V0003 uses `CREATE OR REPLACE TRIGGER`; D4 uses the delete case (zero callers after D5) |
