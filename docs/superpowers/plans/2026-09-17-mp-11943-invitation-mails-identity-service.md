# MP-11943 Invitation mails + identity-service (phases 1+2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invitees receive an e-mail whose link signs them in (or creates / extends an account) and lands them in the Vendor Portal with the membership ACCEPTED; memberships and portal roles live in the new identity-service.

**Architecture:** identity-service (cloned from the vendor backend, Modulith, Lombok) owns memberships and publishes `MembershipInvited` (Avro, Modulith outbox). The marketplace consumes it in a verified `com.yatta.platform.invitation` module that composes the mail from three new collaborators (`MagicLinkIssuer`, `TemplatedMailSender`, `RedirectTargetPolicy`). The gateway repoints its membership client and adds `activateWithResult`; the portal shows the landing state; shop-ui gains the add-to-account entry and the login hint.

**Tech Stack:** Java 25, Spring Boot 4.0/4.1, Spring Modulith 2.x, Spring Kafka + Confluent Avro 8.0, Flyway, Testcontainers; Next.js 16 + Vitest; Angular/Nx + Jest + Playwright; Terraform.

**Spec:** `docs/superpowers/specs/2026-09-17-mp-11943-invitation-mails-identity-service-design.md` (this repo). Read it first; every task cites the section it implements.

## Global Constraints

- Branch in every repo: `topic/main/MP-11943_invitation-mails`. Commit messages: `MP-<ticket>: <description>`. Author credentials: Raphael Lee <raphael.lee@yatta.de>; no AI attribution lines in commits.
- Java 25 (`$HOME/.jdks/temurin-25`), system Maven (`mvn`, not `./mvnw`). Always `mvn spotless:apply` before committing Java in any Java repo. Vendor backend / identity-service: google-java-format AOSP; gateway: AOSP; marketplace: eclipse formatter via spotless.
- Vendor-backend-origin code stays Lombok-free ("move, don't restyle"). identity-service new code, gateway and marketplace: granular Lombok only (`@Getter`, `@RequiredArgsConstructor`, `@Slf4j`), never `@Data` on entities, id-based `equals`/`hashCode`.
- Marketplace: §0 gate block in each PR description; two-commit migration for every touched legacy class; no legacy imports in new target classes except the documented graduated exceptions; `TimeProvider` not `Instant.now()`; JSpecify `@Nullable`; Flyway `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`; no Apache Commons in new code; `spring.kafka.listener.type = batch` is global — the listener declares its own container factory.
- REST paths and payloads of `/memberships/**` are byte-identical after the move; new fields are additive.
- Wire vocabulary: activation reasons `none | already_member | expired | not_found`; invite locale `en | de`, default `en`.
- Portal and shop-ui cannot be built locally (private npm registry) — write tests first anyway; CI on the draft PR is the verification; say so in the PR.
- Topic `platform.identity.membership.v1` (+ `.dlt`), consumer group `marketplace-membership-invitations`, feature flag `membership.invitation-mail.enabled` (default `false`).
- Every repo touched gets a draft PR against `main` linking the epic and the conclave spec PR.

---

## Part A — identity-service bootstrap (MP-11956) · spec §4.1–4.3, §9

### Task A1: Skeleton clone of the vendor backend

**Files:**
- Create in `/home/user/de.yatta.platform.identity-service`: `pom.xml`, `lombok.config`, `.gitignore`, `.editorconfig` (copy vendor backend's), `Dockerfile`, `.github/workflows/ci-cd.yml`, `.github/CODEOWNERS`, `README.md`, `CONTEXT.md`, `docs/adr/`, `src/main/java/de/yatta/platform/identity/IdentityServiceApplication.java`, `src/main/resources/{application.yml,application-local.yml,logback-spring.xml}`, `src/main/resources/db/migration/V0001__event_publication_registry.sql`, `src/test/java/de/yatta/platform/identity/{ModularityTests,DockerAvailabilityGuardIT}.java`.

**Interfaces:** Produces the root package `de.yatta.platform.identity`, `@Modulithic(systemName = "IdentityService")`, the `Clock` bean in `platform.PlatformConfiguration`.

- [ ] **Step 1: Copy skeleton files**

```bash
cd /home/user/de.yatta.platform.identity-service
VB=/home/user/com.yatta.platform.vendor.backend
cp $VB/.gitignore $VB/.editorconfig . 2>/dev/null; cp $VB/Dockerfile .; mkdir -p .github/workflows && cp $VB/.github/workflows/ci-cd.yml .github/workflows/
cp /home/user/de.yatta.platform.gateway/lombok.config .
mkdir -p src/main/java/de/yatta/platform/identity src/main/resources/db/migration src/test/java/de/yatta/platform/identity docs/adr
cp $VB/src/main/resources/db/migration/V0002__event_publication_registry.sql src/main/resources/db/migration/V0001__event_publication_registry.sql
cp $VB/src/main/resources/logback-spring.xml src/main/resources/
```
- [ ] **Step 2: pom.xml** — vendor backend pom with: `groupId de.yatta.platform`, `artifactId identity-service`, version `0.1.0-SNAPSHOT`, sonar keys `YattaSolutions_de.yatta.platform.identity-service`; remove `openfga-sdk`, `resilience4j-spring-boot3`; add `org.projectlombok:lombok` (`optional`) and the compiler `annotationProcessorPaths` block from the gateway pom (lines ~140-148); keep avro-maven-plugin (now also generates `MembershipInvited`). Dockerfile `COPY target/identity-service-*.jar app.jar`.
- [ ] **Step 3: Application class + config**

```java
package de.yatta.platform.identity;
@Modulithic(systemName = "IdentityService")
@SpringBootApplication
public class IdentityServiceApplication { public static void main(String[] a){ SpringApplication.run(IdentityServiceApplication.class, a);} }
```
`application.yml` = vendor backend's with `spring.application.name: identity-service`, datasource `${POSTGRES_DB:identity}` / `${POSTGRES_USER:identity}` / `${POSTGRES_PASSWORD:identity}`, metrics tag `identity-service`, the `marketplace`, `audit`, `memberships` blocks kept, `openfga`/`resilience4j` blocks removed, plus:
```yaml
identity:
  gateway-client:
    # Every internal call from the gateway carries X-Gateway-Client: platform-gateway; nothing else may reach this service.
    required: ${IDENTITY_GATEWAY_CLIENT_REQUIRED:true}
```
`application-local.yml`: `server.port: 8097`, `management.server.port: 8098`, `marketplace.base-url: http://localhost:8013/internal`.
- [ ] **Step 4: ModularityTests + Docker guard** — copy both, package `de.yatta.platform.identity`, application class renamed.
- [ ] **Step 5: `mvn -q -DskipTests compile` passes; `mvn test -Dtest=ModularityTests` passes (trivially, no modules yet).**
- [ ] **Step 6: Commit** `MP-11956: bootstrap identity-service skeleton from the vendor backend`

### Task A2: Copy the platform module (identity header, ids, problems, marketplace client, audit seam)

**Files:** Copy from vendor backend `platform/{identity,id,problem,events,marketplace,audit}/**` and their tests into `src/{main,test}/java/de/yatta/platform/identity/platform/...` with package rename `com.yatta.platform.vendor` → `de.yatta.platform.identity`. Create `platform/PlatformConfiguration.java` (Clock bean, moved from `MembershipConfiguration`). Create `platform/identity/GatewayClientFilter.java` + `GatewayClientFilterTest.java`. `platform/package-info.java` stays `@ApplicationModule(type = Type.OPEN)`.

- [ ] **Step 1: Copy + rename**
```bash
VB=/home/user/com.yatta.platform.vendor.backend/src; ID=/home/user/de.yatta.platform.identity-service/src
for d in main test; do mkdir -p $ID/$d/java/de/yatta/platform/identity/platform; cp -r $VB/$d/java/com/yatta/platform/vendor/platform/* $ID/$d/java/de/yatta/platform/identity/platform/ 2>/dev/null; done
grep -rl "com.yatta.platform.vendor" $ID | xargs sed -i 's/com\.yatta\.platform\.vendor/de.yatta.platform.identity/g'
```
Remove `platform/id/ViewId*` (views stay in the vendor backend).
- [ ] **Step 2: Failing test for the gateway header**
```java
class GatewayClientFilterTest {
  @Test void missingHeaderIsRefusedAs401Problem() throws Exception { /* MockHttpServletRequest without header → filter writes 401, body code authentication_error, chain not called */ }
  @Test void wrongValueIsRefused() ...
  @Test void platformGatewayPasses() ... // chain called
  @Test void actuatorIsExempt() ... // /actuator/health without header passes
  @Test void canBeSwitchedOffByProperty() ... // required=false passes everything
}
```
- [ ] **Step 3: Implement** `GatewayClientFilter extends OncePerRequestFilter` (`@Component`, `@RequiredArgsConstructor`, reads `identity.gateway-client.required` via `IdentityProperties` record `@ConfigurationProperties("identity.gateway-client")`), constant `HEADER = "X-Gateway-Client"`, `EXPECTED = "platform-gateway"`; on refusal writes `ProblemDetail` JSON `{status:401, code:"authentication_error", detail:"Gateway client identity is required."}` via the same shape `GlobalExceptionHandler.problem(...)` produces (reuse by making that helper package-visible static in `platform/problem/Problems.java`).
- [ ] **Step 4: Run** `mvn test -Dtest='GatewayClientFilterTest,EndUserIdArgumentResolverTest,PublicIdCodecTest,MarketplaceClientTest,GlobalExceptionHandlerTest'` → PASS.
- [ ] **Step 5: Commit** `MP-11956: platform module — identity header contract, X-Gateway-Client check, marketplace client`

### Task A3: Gateway property + client bean (MP-11956 part)

**Files:** gateway `PlatformConfig.java` (after `vendorBackendApiClient`), `application.yml` (after `vendor-backend`, line 97), `application-local.yml` (after `vendor-backend`, comment extends the port band with `identity-service 8097`), `README.md` config table (new row after `PLATFORM_GATEWAY_VENDOR_BACKEND_BASE_URL`), `PlatformConfigTest` if present else new `IdentityServiceClientConfigTest` (ApplicationContextRunner asserting the bean's base URL default).

- [ ] Step 1: failing test asserting bean `identityServiceApiClient` exists with default base URL `http://identity-service.integration:8080` and can be overridden by `platform-gateway.identity-service.base-url`.
- [ ] Step 2: implement
```java
@Bean RestClient identityServiceApiClient(RestClient.Builder builder,
        @Value("${platform-gateway.identity-service.base-url:http://identity-service.integration:8080}") String baseUrl,
        ActingAccountResolver actingAccountResolver) {
    return builder.baseUrl(baseUrl).requestInterceptor(new VendorBackendEndUserHeaderInterceptor(actingAccountResolver)).build();
}
```
yml: `identity-service:\n    base-url: ${PLATFORM_GATEWAY_IDENTITY_SERVICE_BASE_URL:http://identity-service.integration:8080}`; local `http://localhost:8097`.
- [ ] Step 3: `mvn test -Dtest=...` PASS; `mvn spotless:apply`; commit `MP-11956: identity-service base URL and RestClient lane`.

### Task A4: Terraform (MP-11956) · spec §9

**Files:** infrastructure `platform-services/identity-service.tf` (new), `platform-services/variables.tf` (append section), `platform-services/stage.tfvars` (`enable_identity_service = true`), `platform-services/dunning-service.tf` (marketplace SA `kafka-platform-core-sa`: add read on the identity topic + write/describe on `.dlt`, conditional on `var.enable_identity_service`), `docs/MP-11957-identity-service-data-migration.md`.

- [ ] Step 1: write `identity-service.tf` = vendor-backend file with: locals `identity_membership_topic_name = "platform.identity.membership.v1"`, `identity_membership_dlt_topic_name = "platform.identity.membership.v1.dlt"`; resources/modules renamed `identity_service_*`, DB name/user `identity`, secret `${var.environment}/identity-service/db-password`, k8s secret `identity-service-db-secret`, topic module for the topic (`retention.ms = var.identity_membership_topic_retention_ms`) and an explicit DLT topic module (`partitions = var.kafka_dlq_topic_partition`, same retention), SA `kafka-identity-service-sa-${var.environment}` with write+describe on the topic (+ audit topic when `enable_audit_service`), schema registry read+write on `"${local.identity_membership_topic_name}-value"` (+ read on audit subject), `consumer_group_prefix = "identity-service"`; optional `kubernetes_manifest "identity_service_internal_authz"` DENY modelled on `platform-backend-authz.tf` with selector `app = "identity-service"`, flag `enable_identity_service_internal_authz` (default false).
- [ ] Step 2: variables: `enable_identity_service` (bool, false, description in the vendor-backend style), `identity_membership_topic_retention_ms` (number, 604800000 = 7 days), `enable_identity_service_internal_authz` (bool, false).
- [ ] Step 3: `terraform fmt -check -recursive platform-services && cd platform-services && terraform init -backend=false && terraform validate` (run inside the repo's expected working dir; if providers cannot download behind the proxy, record that and rely on `terraform-validate.yml`).
- [ ] Step 4: migration runbook doc (MANUAL-MIGRATION-STEPS style): Job manifest running `pg_dump --data-only --column-inserts -t memberships -t portal_role_grants "$VENDOR_URL" | psql "$IDENTITY_URL"`, verify with `SELECT count(*)` on both, rollback = truncate identity tables.
- [ ] Step 5: commit `MP-11956: identity-service database, topics, service account and migration runbook`.

---

## Part B — Move memberships + portal roles (MP-11957) · spec §4.1, §4.2, §4.5

### Task B1: Move the code into identity-service

**Files:** copy vendor backend `memberships/**`, `portalroles/**`, `audit/**` (main + test), `src/main/resources/avro/platform.audit.v1-value.avsc`, tests `MembershipInviteRoleGateIT`; package rename as in A2; remove the `Clock` bean from `MembershipConfiguration` (now in `PlatformConfiguration`); drop `PermissionService` mock from `MembershipInviteRoleGateIT`.

- [ ] Step 1: copy + sed rename (same commands as A2 for `memberships portalroles audit`), plus `cp $VB/main/resources/avro/platform.audit.v1-value.avsc` and `$VB/test/java/.../MembershipInviteRoleGateIT.java`.
- [ ] Step 2: Flyway `V0002__create_memberships.sql`:
```sql
CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY,
  vendor_namespace VARCHAR(128) NOT NULL,
  email VARCHAR(320) NOT NULL,
  invited_by_account_id UUID NOT NULL,
  account_id UUID,
  status VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_memberships_vendor_email ON memberships (vendor_namespace, LOWER(email));
CREATE INDEX IF NOT EXISTS idx_memberships_email ON memberships (LOWER(email));
```
(verify column nullability against `Membership.java` `@Column(nullable=...)` before committing.) `V0003__create_portal_role_grants.sql` = vendor V0006 with `CHECK (role IN ('ADMIN','VIEWER'))`.
- [ ] Step 3: add `.header("X-Gateway-Client", "platform-gateway")` to every MockMvc request in the moved `MembershipControllerTest` and `MembershipInviteRoleGateIT` (record in commit body: only permitted change). `SavedViewsEndToEndIT` is not moved; write `MembershipsEndToEndIT` later (Task C2).
- [ ] Step 4: `mvn verify` (Docker is up) → green incl. `ModularityTests` (modules: `audit`, `memberships`, `platform`, `portalroles`).
- [ ] Step 5: `CONTEXT.md` glossary (terms: Identity service, Membership, Invitation, Activation, Verified address, Match key, Effective status, Portal role grant, Portal role, Effective role, Identity header, Gateway client header — copied from the vendor backend's `CONTEXT.md` and reworded to the new owner); `README.md` (API table, env table incl. `IDENTITY_GATEWAY_CLIENT_REQUIRED`, local port 8097); ADR `0002-fresh-schema-not-replayed-history.md`, ADR `0003-gateway-client-header-required.md`.
- [ ] Step 6: commit `MP-11957: move memberships, portal roles and their audit trail into identity-service`.

### Task B2: Vendor backend loses them

**Files (vendor backend):** delete `memberships/**`, `portalroles/**`, `audit/**`, `platform/audit/**`, `platform/marketplace/**`, `authorization/**`, `src/main/resources/avro/`, tests of all of these (`MembershipInviteRoleGateIT`, `AuditConfigurationTest`, `AuditedAspectTest`, `Membership*`, `PortalRole*`, `MarketplaceClient*`, `OpenFga*`, `EmailMatchKeyTest` stays only if `EmailMatchKey` is still used — it is not; delete), `src/test/resources/fga/`; add `platform/PlatformConfiguration.java` with the `Clock` bean; pom: remove `kafka-avro-serializer`, `openfga-sdk`, `resilience4j-spring-boot3`, `spring-boot-starter-aspectj`, avro plugin, confluent repository; `application.yml`: remove `marketplace`, `audit`, `memberships`, `openfga`, `resilience4j`, `spring.kafka.properties.schema.registry.url`; `application-local.yml`: remove `marketplace`; README (API table now saved views only, env table, deployment note "memberships moved to identity-service, MP-11957"), `CONTEXT.md` (remove moved terms, add pointer), `docs/implementation-notes.md`.

- [ ] Step 1: delete and adjust; `mvn verify` green (`SavedViewsEndToEndIT`, `SavedView*`, `EndUserIdArgumentResolverTest`, `PublicIdCodecTest`, `ViewIdTest`, `GlobalExceptionHandlerTest`, `ModularityTests`).
- [ ] Step 2: commit `MP-11957: memberships, portal roles, audit and the marketplace client moved to identity-service`.

### Task B3: Gateway repoint

**Files:** `InternalMembershipClient.java` (field `vendorBackendApiClient` → `identityServiceApiClient`; javadoc), `InternalMembershipClientIntegrationTest` (`BASE = "http://identity-service"`), `membership/package-info.java` (upstream sentence), `CONTEXT.md` Membership entry ("held by identity-service"), `docs/graphql-api.md` rows 938/944/945, `docs/savedviews.md` unaffected.

- [ ] Step 1: tests updated first (`bind()` builder base URL) → fail on field name; Step 2: rename field; Step 3: `mvn test -Dtest='InternalMembershipClientIntegrationTest,MembershipWireIntegrationTest,MembershipServiceTest,ModularityTests'` PASS; `spotless:apply`; commit `MP-11957: membership lane talks to identity-service`.

---

## Part C — `MembershipInvited` event (MP-11944) · spec §4.4

### Task C1: Locale on the invite request

**Files (identity-service):** `memberships/api/InviteRequest.java` (`@Nullable @Pattern(regexp = "en|de") String locale`), `MembershipController.invite` (`request.localeOrDefault()`), `MembershipService.invite(EndUserId, List<String>, String locale)`, `MembershipControllerTest` (locale absent → `en`; `fr` → 400 `validation_failed`), `MembershipServiceTest`.
**Files (gateway):** `schema.graphqls` `MembershipInviteInput { emails: [String!]!  "en | de; the language the invitation mail is written in. Default en." locale: String }`, `MembershipGraphqlController.MembershipInviteInput(List<String> emails, String locale)`, `MembershipService.invite(emails, locale, key)`, `InternalMembershipClient.invite(emails, locale, key)` + `InviteBody(emails, locale)`, tests (`MembershipWireIntegrationTest.invite` verify captures locale; client test `jsonPath("$.locale")`), `SchemaShapeRegressionTest` pin `inputFieldsOf("MembershipInviteInput") == {emails: "[String!]!", locale: "String"}`.
**Files (portal):** `src/lib/gateway-graphql.ts` `inviteMembers(emails, locale, idempotencyKey = crypto.randomUUID())` with `mutation ($input: MembershipInviteInput!) { membership { invite(input: $input) {...} } }` variables `{ input: { emails, locale } }`; `MembersClient.handleInvite({ emails, locale }, key)`; tests `gateway-graphql.test.ts` (body variables contain locale), `MembersClient.test.tsx` (`inviteMembers` called with `(emails, 'en', key)`).

- [ ] Step 1 tests → fail; Step 2 implement; Step 3 backend + gateway `mvn test`; portal tests written (CI); Step 4 commits `MP-11944: invitation locale travels portal → gateway → identity-service` (one per repo).

### Task C2: Event + externalization

**Files (identity-service):**
- Create `src/main/resources/avro/platform.identity.membership.v1-value.avsc`:
```json
{"type":"record","name":"MembershipInvited","namespace":"de.yatta.platform.identity.memberships.avro",
 "doc":"Published by identity-service once per accepted invite (fresh or renewed). Consumers compose the invitation mail; nothing here is a credential. Key: membership_id.",
 "fields":[
  {"name":"membership_id","type":"string","doc":"mbr_ TypeID of the membership row."},
  {"name":"vendor_namespace","type":"string","doc":"Vendor id namespace the invitee joins."},
  {"name":"email","type":"string","doc":"Address exactly as the inviter entered it."},
  {"name":"invited_by_account_id","type":"string","doc":"acct_ TypeID of the inviting account."},
  {"name":"locale","type":"string","default":"en","doc":"BCP-47 language for the mail: en | de."},
  {"name":"expires_at","type":"long","doc":"Epoch millis after which the invitation is no longer claimable."},
  {"name":"occurred_at","type":"long","doc":"Epoch millis of the invite or renewal."},
  {"name":"idempotency_key","type":"string","doc":"membership_id:occurred_at — identical on redelivery, new on renewal."}]}
```
- Create `memberships/events/MembershipInvitedEvent.java` (record, `@Externalized("platform.identity.membership.v1::#{#this.membershipId()}")`, static `of(Membership, EndUserId, String locale, Instant now)`).
- Create `eventing/package-info.java` (`@ApplicationModule(allowedDependencies = {"memberships :: events"})` — or make `events` a named interface via `@NamedInterface("events")` on `memberships/events/package-info.java`), `eventing/KafkaExternalizationConfiguration.java`:
```java
@Configuration(proxyBeanMethods = false)
class KafkaExternalizationConfiguration {
  @Bean EventExternalizationConfiguration eventExternalizationConfiguration() {
    return EventExternalizationConfiguration.externalizing().select(EventExternalizationConfiguration.annotatedAsExternalized())
        .mapping(MembershipInvitedEvent.class, MembershipInvitedAvroMapper::toAvro).build();
  }
  @Bean ProducerFactory<Object, Object> kafkaProducerFactory(KafkaProperties kafkaProperties) {
    Map<String, Object> config = new HashMap<>(kafkaProperties.buildProducerProperties());
    Map<String, Object> avroConfig = new HashMap<>(config); avroConfig.put("auto.register.schemas", true);
    Serializer<Object> avro = newAvroSerializer(avroConfig);   // reflective, like AuditConfiguration, class name string
    Serializer<Object> json = new JsonSerializer<>();
    Map<Class<?>, Serializer<?>> byType = new LinkedHashMap<>(); byType.put(SpecificRecord.class, avro); byType.put(Object.class, json);
    var factory = new DefaultKafkaProducerFactory<Object, Object>(config, new StringSerializer(), new DelegatingByTypeSerializer(byType, true));
    return factory;
  }
}
```
(`DelegatingByTypeSerializer(Map, boolean assignable)` — verify the exact constructor in spring-kafka 4.x javadoc before writing; key serializer must be `StringSerializer` since Modulith passes a String key.)
- `MembershipService`: inject `ApplicationEventPublisher events`; `invite` gets `@Transactional`; in `write(...)` after `saveAndFlush` (both branches) `events.publishEvent(MembershipInvitedEvent.of(saved, actingUser, locale, now))`.
- Tests: `MembershipServiceTest` (+publish on fresh, +publish on renewal, no publish on refused, no publish when the marketplace verdict denies); `MembershipInvitedEndToEndIT` (Postgres + `apache/kafka-native:3.8.0`, `spring.kafka.properties.schema.registry.url=mock://identity-it`, `memberships.invitation-ttl=PT1S`, `audit.enabled=false`, `@MockitoBean MarketplaceClient` answering `vendorScope` managing `vnd_acme` + `invitability` invitable; POST invite twice with a 1.5 s sleep via `await()`; consumer `KafkaAvroDeserializer` with the same mock URL reads two `GenericRecord`s keyed `mbr_…`, second `occurred_at` > first; a refused address → still exactly two records).
- ADR `docs/adr/0001-avro-over-modulith-outbox.md`.
- `README.md` topic table; `CONTEXT.md` term **Membership invited (event)**.

- [ ] Steps: tests → red; implement; `mvn verify` green; commit `MP-11944: publish MembershipInvited through the Modulith outbox as Avro`.

---

## Part D — Marketplace refactors (MP-11945, 11946, 11947) · spec §5.1–5.4

All in `/home/user/de.yatta.platform.marketplace/com.yattasolutions.platform.marketplace.application-boot`. Run `mvn spotless:apply` before each commit. Each migration = two commits.

### Task D1: RedirectTargetPolicy (MP-11947) — new code, no legacy touched

**Files:** `com/yatta/platform/account/redirect/{RedirectTarget,RedirectTargetPolicy,RedirectTargetProperties}.java`, test `RedirectTargetPolicyTest`, `application.properties` (`account.redirect-target.portal-origin = ${VENDOR_PORTAL_ORIGIN:https://portal.yatta.de}`, `account.redirect-target.locales = en,de`), `application-dev.properties` (`https://portal.yatta.local`), `application-stage.properties` (`https://portal.stage.platform.yatta.de`), `application-preview.properties`, `application-production.properties` (`https://portal.yatta.de`), `application-test.properties` (`https://portal.test.invalid`).

```java
public record RedirectTarget(String path) {
  public static RedirectTarget unvalidatedFromCheckout(@Nullable String returnUrlPath) { return new RedirectTarget(returnUrlPath); } // javadoc: transitional; checkout keeps its own rules (MP-11947 scope)
}
@Component @RequiredArgsConstructor @Slf4j @EnableConfigurationProperties(RedirectTargetProperties.class)
public class RedirectTargetPolicy {
  private final RedirectTargetProperties properties;
  public RedirectTarget validate(@Nullable String raw) { /* rules per spec §5.4; on rejection log.warn and return root() */ }
  public RedirectTarget root() { return new RedirectTarget("/" + properties.locales().get(0)); }
  public String absolute(RedirectTarget t) { return properties.portalOrigin() + t.path(); }
}
```
- [ ] Table test (accepted: `/en/members?invited=1`, `/de`, `/en/members?x=%20y`; rejected: null, blank, 513 chars, `https://evil`, `//evil`, `/\evil`, `/en/../x`, `/en/%2e%2e/x`, `/fr/x`, `/members`, control chars) → red → implement → green → commit `MP-11947: RedirectTargetPolicy mirrors the gateway continueTo rules`.

### Task D2: MagicLinkIssuer (MP-11945) — new code

**Files:** `com/yatta/platform/account/magiclink/{MagicLinkIssuer,DefaultMagicLinkIssuer,MagicLink}.java`, `DefaultMagicLinkIssuerTest`.

```java
public interface MagicLinkIssuer {
  MagicLink issueSignIn(String email, UUID userUuid, RedirectTarget target, @Nullable VendorContext vendorContext, Locale locale, RedirectAnchor anchor, boolean skipAutostart);
  MagicLink issueSignUp(User user, String email, RedirectTarget target, @Nullable VendorContext vendorContext, Locale locale, RedirectAnchor anchor, boolean skipAutostart);
}
public record MagicLink(String dataId, String secret, String url, Instant expiresAt) {}
```
`DefaultMagicLinkIssuer` (`@Service @RequiredArgsConstructor`): deps `DoubleOptInDataRepository`, `AccountConfirmationRepository`, `UserService`, `RedirectService`, `TimeProvider`; sign-in = the `DoubleOptInData` block from `AuthenticationInitiationServiceImpl.signingInWithMagicLink` (15 min, `KeyGenerator`, `returnUrlPath = target.path()`, vendor from context); sign-up = `registerUserWithoutPassword` body (delete stale confirmation, `populateNonAcademicAccountConfirmation(timeProvider, target.path(), vendor, null, normalizedEmail)`, `updateUser`); URL = `redirectService.buildSecureRedirectUrl(new ConfirmEmailRedirectModel(email, dataId, target.path(), SIGN_IN|SIGN_UP, secret, locale, vendorNamespace, RequestOrigin.fromRedirectAnchor(anchor), null, null){skipAutostart}, anchor)`. Legacy imports (`DoubleOptInData`, `RedirectService`, `UserService`, `KeyGenerator`, `RequestOrigin`, `VendorContext`, `RedirectAnchor`) are graduated exceptions 2–4; list them in the class javadoc as debt.
- [ ] Tests (Mockito): row saved with TTL 15 and returnUrlPath; secret + dataId non-blank and distinct; `buildSecureRedirectUrl` called with a `ConfirmEmailRedirectModel` whose `context`/`skipAutostart`/`returnPath` match; sign-up deletes an existing confirmation first. Red → green → commit `MP-11945: MagicLinkIssuer issues token rows and renders the secure link`.

### Task D3: AuthenticationInitiationServiceImpl delegates (MP-11945) — migration

- [ ] Commit 1: `git mv src/main/java/com/yattasolutions/platform/marketplace/security/service/impl/AuthenticationInitiationServiceImpl.java src/main/java/com/yatta/platform/account/service/AuthenticationInitiationServiceImpl.java`; change only the `package` line (imports of the old same-package types become explicit — add the import lines that the package change strictly requires, nothing else). Compile. Commit `MP-11945: move AuthenticationInitiationServiceImpl to com.yatta.platform.account.service (commit 1/2, pure move)`.
- [ ] Commit 2: remove `@Service` from the target class; create stub `com/yattasolutions/platform/marketplace/security/service/impl/AuthenticationInitiationServiceImpl.java`:
```java
@Deprecated(forRemoval = true) @Service
public class AuthenticationInitiationServiceImpl extends com.yatta.platform.account.service.AuthenticationInitiationServiceImpl {
  public AuthenticationInitiationServiceImpl(/* same 13 params */) { super(...); }
}
```
In the target class: replace the bodies of `signingInWithMagicLink` and `registerUserWithoutPassword` with `magicLinkIssuer.issueSignIn(...)` / `issueSignUp(...)` — **but** keep the two `platformAccountMailService.sendSignInMail/sendSignUpMail` calls, which need the `DoubleOptInData`/`AccountConfirmation` entity: therefore `MagicLink` gets an extra component `DoubleOptInData data` (rename record to `MagicLink(String url, DoubleOptInData data)`; adjust D2 tests) and the issuer takes a `boolean renderUrl` — no: KISS, the issuer always renders (one `RedirectRequest` row per issue, exactly what `createMagicLink` does today at mail time). To keep `/chckout/auth/init` byte-identical the listener in `PlatformAccountMailServiceImpl` must reuse the URL already rendered instead of rendering a second one → `SignInMailEvent`/`ConfirmationAccountMailEvent` gain a `@Nullable String magicLinkUrl`; when present the listener uses it, else it renders as today. Add `MagicLinkIssuer` to the constructor (stub passes it through). Existing suites: `mvn test -Dtest='MagicLinkTest,StandaloneMagicLinkTest,SolutionPortalMagicLinkTest,AuthenticationEmailsTest,OAuthAuthenticationTest'` green. Commit `MP-11945: AuthenticationInitiationServiceImpl delegates magic-link issuance (commit 2/2)`.

### Task D4: AuthenticationEmailTemplateResolver + MailPurpose (MP-11946) — migration

- [ ] Commit 1: `git mv .../security/service/impl/authenticationemail/AuthenticationEmailTemplateResolver.java src/main/java/com/yatta/platform/mail/template/AuthenticationEmailTemplateResolver.java` and `AuthenticationEmailTemplate.java` → `com/yatta/platform/mail/template/MailTemplate.java`? No — a rename is Commit 2 work; Commit 1 moves both with unchanged names. Commit `MP-11946: move AuthenticationEmailTemplateResolver (commit 1/2, pure move)`.
- [ ] Commit 2: create `MailPurpose` enum (spec §5.3), `resolveTemplate(RedirectAnchor, VendorContext, MailPurpose, Channel)`, `resolveInviteTemplate(MailPurpose)` → `authentication/vendorportal/web/invite/<leaf>/` with `Environment.VENDOR_PORTAL("vendorportal")` and `Flow.INVITE("invite")`; rename record to `MailTemplate(String templatePath, String from)`; stub at the old location: `@Deprecated(forRemoval=true) @Service class AuthenticationEmailTemplateResolver extends target { resolveTemplate(anchor, ctx, boolean isSignUp, channel) { return super.resolveTemplate(anchor, ctx, isSignUp ? MailPurpose.SIGN_UP : MailPurpose.SIGN_IN, channel); } }` plus legacy `AuthenticationEmailTemplate` kept as a deprecated record with a `from(MailTemplate)` adapter. Test `AuthenticationEmailTemplateResolverTest`: for every `Environment × Channel × Flow(authenticate,purchase) × {signin,signup}` that exists on disk today (enumerate the folder list from spec §2) assert the resolved path equals the legacy resolver's output (drive the stub and the target and compare) and that `Subject.vm` + `Html.vm` exist for `en` and `de`; invite paths asserted to exist after Task E1. Commit `MP-11946: MailPurpose replaces the isSignUp flag (commit 2/2)`.

### Task D5: TemplatedMailSender + PlatformAccountMailServiceImpl (MP-11946) — migration

- [ ] Snapshot fixtures FIRST (pre-refactor): a throwaway test `MailSnapshotCaptureTest` (not committed) or a one-off `@MailReview`-style run producing `src/test/resources/mail-snapshots/{vendor-web-authenticate-signin,vendor-web-authenticate-signup}_{en,de}.{subject,html}` via the current `PlatformAccountMailServiceImpl` path with a fake `MailService` capturing the `MimeMessage`; commit the fixtures `MP-11946: capture sign-in/sign-up mail snapshots before the facade refactor`.
- [ ] Commit 1: `git mv .../applicationboot/app/mailing/account/impl/PlatformAccountMailServiceImpl.java src/main/java/com/yatta/platform/mail/service/PlatformAccountMailServiceImpl.java` (package line only). Commit.
- [ ] Commit 2: create `com/yatta/platform/mail/template/{TemplatedMailSender,TemplatedMimeMessagePreparator,Recipient,Sender,MailModelContributor}.java`, `com/yatta/platform/mail/template/StaticPageModelContributor.java` (tosLink, privacyPolicyLink, vendorAgreementLink, accountManagementLink); `PlatformAccountMailServiceImpl` uses `templatedMailSender.send(template, model, new Recipient(email), new Sender(from), locale)` for every mail, `bcc` becomes a `Sender`/`Recipient` option (`Recipient(String to, @Nullable String bcc)`); stub `@Deprecated(forRemoval=true) @Component("platformAccountMailService") class PlatformAccountMailServiceImpl extends target` at the old path. `TemplatedMailSenderTest` (fake `MailService`, fake `MailTemplateEngine`: subject suffix, escapeHtml true/false, contributors merged, model wins over contributor). `MailRenderingSnapshotTest` compares the four fixtures byte-for-byte. Run the auth suites. Commit `MP-11946: TemplatedMailSender facade; account mails render through it (commit 2/2)`.

---

## Part E — Templates + composer (MP-11949, MP-11950) · spec §5.5–5.6

### Task E1: Templates

**Files:** `src/main/resources/com/yattasolutions/platform/marketplace/mail/{en,de}/authentication/vendorportal/web/invite/{signin,create-or-add}/{Html,Subject}.vm` (8 files). Model: `solutionportal/web/authenticate/signin`. Variables per spec §5.5; secondary CTA under `#if($addToAccountLink)`; `Subject.vm` single line, no trailing newline. EN copy: subject `You have been invited to $vendorName on Yatta` / body "…$inviterEmail invited you to manage $vendorName in the Vendor Portal. Sign in to accept: → Sign in and accept … This invitation expires on $expiresAt." Variant 2 adds "→ Create account" and "Already have a Yatta account? → Add this e-mail to my existing account". DE equivalents in the informal register the existing templates use (`du`).
- [ ] Extend `AuthenticationEmailTemplateResolverTest` to assert both invite folders exist for `en`/`de` → red → add files → green. Render smoke: `MailRenderingSnapshotTest.invitationTemplatesRenderWithoutMissingVariables` renders all four with a full model and asserts no `$` remains. Commit `MP-11949: invitation mail templates DE/EN, sign-in and create-or-add variants`.

### Task E2: Modulith in the marketplace + module skeleton

**Files:** `pom.xml` (`spring-modulith-bom` 2.0.0 import in `dependencyManagement`; deps `spring-modulith-starter-core`, test `spring-modulith-starter-test`, test `spring-kafka-test`), `com/yatta/platform/{mail,account,vendor,shared}/package-info.java` (`@ApplicationModule(type = ApplicationModule.Type.OPEN)`), `com/yatta/platform/invitation/package-info.java` (`@ApplicationModule(displayName = "Invitations", allowedDependencies = {"mail", "account", "vendor", "shared"})`), `src/test/java/com/yatta/platform/invitation/ModularityTests.java`:
```java
class ModularityTests {
  static final ApplicationModules modules = ApplicationModules.of("com.yatta.platform");
  @Test void invitationModuleDependsOnlyOnItsDeclaredNeighbours() { modules.getModuleByName("invitation").orElseThrow().verifyDependencies(modules).throwIfPresent(); }
}
```
- [ ] Red (module missing) → add package-info → green. Commit `MP-11950: Spring Modulith verifies the invitation module in isolation`. ADR `docs/adr/0001-invitation-module-verified-in-isolation.md` (marketplace repo `docs/adr/` is new; create).

### Task E3: Composer, idempotency, listener, flag

**Files:** `com/yatta/platform/invitation/event/{MembershipInvitedMessage,MembershipInvitedListener}.java`, `service/{InvitationMailComposer,InvitationVariantResolver,AddToAccountLinkBuilder}.java` (builder lands in F1; composer tolerates its absence via `@Nullable`), `entity/ProcessedInvitation.java` (`@Entity @Table(name="processed_membership_invitation")`, `@Id UUID id`, `idempotency_key` unique, `membership_id`, `processed_at`; `@Getter`, id-based equals/hashCode — the first entity in the repo to do so, note it), `repository/ProcessedInvitationRepository.java`, `config/{InvitationKafkaConfiguration,InvitationMailProperties,ConditionalOnInvitationMailEnabled}.java`, `db/migration/V0381__processed_membership_invitation.sql`:
```sql
CREATE TABLE IF NOT EXISTS processed_membership_invitation (
  id UUID PRIMARY KEY, idempotency_key VARCHAR(128) NOT NULL, membership_id VARCHAR(64) NOT NULL, processed_at TIMESTAMPTZ NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_processed_membership_invitation_key ON processed_membership_invitation (idempotency_key);
```
`application.properties`: `membership.invitation-mail.enabled = ${MEMBERSHIP_INVITATION_MAIL_ENABLED:false}`, `membership.invitation-mail.topic = platform.identity.membership.v1`, `membership.invitation-mail.group-id = marketplace-membership-invitations`; `application-dev.properties`/`-test.properties` consumer basics (`spring.kafka.consumer.auto-offset-reset = earliest`).
Listener:
```java
@Component @ConditionalOnInvitationMailEnabled @RequiredArgsConstructor @Slf4j
class MembershipInvitedListener {
  private final InvitationMailComposer composer;
  @KafkaListener(topics = "${membership.invitation-mail.topic}", groupId = "${membership.invitation-mail.group-id}", containerFactory = "membershipInvitedListenerContainerFactory")
  void onMessage(ConsumerRecord<String, GenericRecord> record) { composer.compose(MembershipInvitedMessage.from(record.value())); }
}
```
Composer per spec §5.6 (steps 1–6), `@Transactional`. `InvitationVariantResolver.resolve(email)` → `KNOWN_ACCOUNT(User)` | `UNKNOWN`, using `userService.findUserByEmail` and `user.isActivated()`.
- [ ] Tests: `InvitationMailComposerTest` (variant 1 → `issueSignIn`, template `INVITE_SIGN_IN`, model has link/vendorName/inviterEmail/expiresAt/uuid; variant 2 → `issueSignUp` + `addToAccountLink`; redelivery (repo says exists) → no issuer, no send; rate-limit exceeded → no send, WARN), `MembershipInvitedListenerTest` (`@EmbeddedKafka(partitions=1, topics=...)`, Avro `GenericRecord` produced with `KafkaAvroSerializer` on `mock://mp-it`, listener container built from `InvitationKafkaConfiguration` with a Mockito composer; poison record (non-Avro bytes) → `.dlt` receives it, composer never called), `ProcessedInvitationTest` (equals/hashCode by id). Flyway validity: run one existing `@SpringBootTest` (`SolutionPortalMagicLinkTest`) after adding V0381.
- [ ] Commit `MP-11950: MembershipInvited consumer composes the invitation mail (variant 1 / 2), idempotent, dead-lettered, flag-gated`.

---

## Part F — Add-to-account CTA (MP-11951) · spec §5.7

### Task F1: Marketplace

- [ ] Migration of `AuthenticationAutostartContext` (enum → delete case): Commit 1 `git mv` to `com/yatta/platform/account/dto/AuthenticationAutostartContext.java` (package line); Commit 2 add `ADD_EMAIL`, update the six importers (`PlatformAccountMailServiceImpl` target, `OAuthAuthenticationController`, `RedirectController`, `ConfirmEmailRedirectModel`, `ConfirmEmailAutostartParams`, `CheckoutConfirmEmailAutostartParams`, `AutostartParameterModel`), no stub. `RedirectController` CONFIRM_EMAIL: `if (autostartParameter.getContext() == ADD_EMAIL) { confirmEmailAutostartParams = build...; autostartRefModel = confirmEmailAutostartParams; break; }` before the confirm calls (no session, no cookie). `AddToAccountLinkBuilder.build(email, RedirectTarget target, Locale)` → `redirectService.buildSecureRedirectUrl(new ConfirmEmailRedirectModel(email, null, target.path(), ADD_EMAIL, null, locale, null, RequestOrigin.ACCOUNT_MANAGEMENT?, null, null), accountManagementAnchor)` where the anchor is the `ACCOUNT_MANAGEMENT` type (find the existing implementation via `VendorAccessService.generateRedirectAnchor("ACCOUNT_MANAGEMENT")` or the class implementing it). `AccountEmailController.registerNew` body `EmailAddressModel` gains `@Nullable String redirect` → `RedirectTargetPolicy.validate` → `accountRegistrationService.addNewEmailToAccountAndAwaitConfirmation(user, email, check, returnUrlPath)` (legacy interface touched → its impl `AccountRegistrationServiceImpl` migration too: Commit 1 move to `com/yatta/platform/account/service/`, Commit 2 add the overload + stub). `CONFIRM_ASSIGNED_EMAIL` autostart params gain `redirect` from the stored `returnUrlPath`.
- [ ] Tests: `AddToAccountLinkBuilderTest`, `RedirectControllerTest` ADD_EMAIL branch (no session, params carry email + returnPath), `AccountEmailControllerTest` redirect validation. Commits per migration + `MP-11951: add-to-account link, ADD_EMAIL autostart context, redirect after e-mail confirmation`.

### Task F2: shop-ui

**Files:** `libs/account/src/lib/auth-context/model/authentication-context.ts` (`| 'ADD_EMAIL'`), `auth-context.state.spec.ts`, `libs/authentication/src/lib/registration-complete/confirm-authentication-startup.guard.ts` (`const raw = route.queryParamMap.get('context'); const context: AuthenticationContext = raw === 'SIGN_UP' || raw === 'ADD_EMAIL' ? raw : 'SIGN_IN';` and an early branch: `ADD_EMAIL` → `store.dispatch(new GotoAddEmail({ queryParams: { email }, redirect }))` — but the guard lives in `libs/authentication` while `GotoAddEmail` is an account-management action → put `GotoAddEmail` in `libs/account/src/lib/account-router/goto-actions.ts` next to `GotoSignIn`), `apps/account-management/src/app/redirect/autostart.service.ts` (branch `type === 'confirmEmail' && context === 'ADD_EMAIL'` → if `SessionState.isSignedIn` dispatch `GotoAddEmail` else `GotoSignIn({ redirect: currentUrl })`), `apps/account-management/src/app/navigation.service.ts` (`openModalOn([GotoAddEmail], AddEmailModal)`), `apps/account-management/src/app/profile/add-email/add-email.component.ts` (inject modal data `{ email?: string; redirect?: string }` the way `VerifyEmailComponent` does; `patchValue`; pass `redirect` into `AddEmailAddress(email, redirect)` → `profile.actions.ts` + `profile.state.ts` → `POST /chckout/account/email/registerNew` body `{ email, redirect }`), `apps/account-management/src/app/redirect/model/assigned-email-autostart-params.ts` (`redirect: string | null` on all three), `assigned-email.service.ts` (`getAssignedEmailNavigation(isSignedIn, redirect)`: absolute `redirect` matching `environment.vendorPortalOrigin` → `window.location.assign` via `NavigateByUrl`; else `/profile`), specs: `add-email.component.spec.ts` (prefill), `assigned-email.service.spec.ts` (redirect followed / ignored), `confirm-authentication-startup.guard.spec.ts` (ADD_EMAIL preserved), `autostart.service.spec.ts`.
- [ ] Write specs first; implement; `npx nx format:write`; `npm run inject:file` on the edited template if ids change (they do not). Commit `MP-11951: ADD_EMAIL autostart opens add-email prefilled and returns to the portal`.

---

## Part G — Activation result + portal landing (MP-11952) · spec §6

### Task G1: identity-service `ActivationResult`

**Files:** `memberships/ActivationResult.java` (replaces `ActivationOutcome.java`), `ActivationReason` enum `{JOINED("none"), ALREADY_MEMBER("already_member"), EXPIRED("expired"), NOT_FOUND("not_found"); String wire}`, `MembershipService.activate` returns `ActivationResult` (never Optional): keys empty → NOT_FOUND; held empty → NOT_FOUND; accepted by me → grant ? ALREADY_MEMBER : NOT_FOUND; no claimable but some PENDING-expired row → EXPIRED; grant refused → NOT_FOUND; lost claim → ALREADY_MEMBER / NOT_FOUND as today; joined → JOINED. `api/ActivationResponse(boolean activated, String reason, @Nullable String vendorNamespace)`, controller maps. `AuditedAspect.recorded()` handles `AuditableOutcome` (ActivationResult implements it: `auditable() = reason == JOINED`). Tests: `MembershipActivationTest` (all reasons), `MembershipControllerTest` (`$.reason`, `$.vendor_namespace`), `AuditedAspectTest` unchanged semantics.
- [ ] Red → green → commit `MP-11952: activation answers a reason and the vendor namespace`.

### Task G2: Gateway `activateWithResult`

**Files:** `schema.graphqls` (type `MembershipActivationResult { activated: Boolean! reason: String! vendor_namespace: String }`, field `activateWithResult`, `activate` `@deprecated(reason: "Use activateWithResult; the boolean stays for one release")`, descriptions rewritten), `membership/model/MembershipActivationResult.java` (`@JsonIgnoreProperties(ignoreUnknown=true) record (boolean activated, String reason, @JsonProperty("vendor_namespace") @Nullable String vendorNamespace)`), `InternalMembershipClient.activate()` → record (null body → `new MembershipActivationResult(false, "not_found", null)`), `MembershipService.activate()` → record, controller `activate()` = `activate().activated()` + `activateWithResult()`; `membership/package-info.java`; tests: `MembershipServiceTest`, `InternalMembershipClientIntegrationTest` (three activation tests adapt; the strict-mapper test now targets the public record), `MembershipWireIntegrationTest` (+ `mutation { membership { activateWithResult { activated reason vendor_namespace } } }`), `SchemaShapeRegressionTest` (`fieldsOf("MembershipActions")` = `{invite, activate: Boolean!, activateWithResult: MembershipActivationResult!}`, `fieldsOf("MembershipActivationResult")`), `docs/graphql-api.md`, `CONTEXT.md` (Account namespace: relayed in the activation result), ADR `0011-activation-result-relays-namespace.md`.
- [ ] Red → green → `spotless:apply` → commit `MP-11952: activateWithResult exposes the activation reason`.

### Task G3: Portal landing state + placeholder removal

**Files:** `src/lib/membership-activation.ts` (new shape + module store: `let last: ActivationResult | null; const listeners = new Set<() => void>(); export function useLastActivation()` via `useSyncExternalStore`), `src/lib/__tests__/membership-activation.test.ts` (6 tests adapt: `expect(result).toEqual({ outcome: 'granted', reason: 'none', vendorNamespace: 'vnd_acme' })`, query contains `activateWithResult`), `src/components/providers/SessionProvider.tsx` (`activation.outcome`; `vendor-scope-unavailable` screen: when `new URLSearchParams(window.location.search).get('invited') === '1'` and `last?.outcome === 'refused'` show `t('invitationExpired')` for `expired` else `t('invitationNotFound')`), `src/components/members/InvitationLandingToast.tsx` (client, `useSearchParams`, `useLastActivation`, `showToast` once, `history.replaceState` strip — export `stripMarkerFromUrl` from `session-guard.ts` and reuse), `src/components/members/MembersClient.tsx` (`<Suspense fallback={null}><InvitationLandingToast /></Suspense>`), `src/components/members/__tests__/InvitationLandingToast.test.tsx` (mock `next/navigation` `useSearchParams`, mock `@/components/shared/Toast` `showToast`; granted+none → accepted toast; granted+already_member → info toast; no marker → nothing; marker stripped), `SessionProvider.test.tsx` (activation mock values become objects; new expired-screen test), `messages/{en,de}.json`: add `members.activation.{accepted,alreadyMember}`, `members.statusValues.expiredHint`, `session.{invitationExpired,invitationNotFound}`; delete `team`, `invite`, `session.denied.areas.team`; delete `src/app/[locale]/invite/**`, `src/app/[locale]/settings/team/**`, `src/lib/placeholders/team.ts`, `src/lib/__tests__/placeholders-team.test.ts`; `src/lib/routes.ts` `FLOW_PATHS = ['/terms']` + comment; `routes.test.ts:32` → `expect(isRoutablePath('/invite/accept')).toBe(false)`; `Breadcrumbs.tsx` regex without `team`; `breadcrumbTrail.test.ts:75` → `false`; `RequireCapability` area union loses `team` if typed. `node scripts/check-message-parity.mjs` passes.
- [ ] Commit `MP-11952: invitation landing toast, expired/not-found notice, placeholder team/invite modules removed`.

---

## Part H — Login hint (MP-11953) · spec §7

- [ ] H1 gateway: `platform/security/LoginHintPolicy.java` (`Optional<String> accept(String raw)`: ≤254, exactly one `@`, no whitespace/control/`<>"`), `ContinueToAuthorizationRequestResolver` takes it and adds `additionalParameters.put("login_hint", v)`; `LoginHintPolicyTest` (table), `ContinueToCarryTest` (+hint carried, malformed dropped). Commit `MP-11953: login_hint passes through to the authorization server when it is an e-mail`.
- [ ] H2 shop-ui: `AuthFormEmailGuard` reads `email ?? login_hint`; `authentication-routes.ts` `sign-in` `canActivate: [AuthFormEmailGuard, EmailAuthenticationStartupGuard]`; spec adds the `login_hint` case. Commit `MP-11953: prefill the sign-in address from login_hint`.
- [ ] H3 portal: `ssoLoginUrl(continueTo, options?: { loginHint?: string })`, `redirectToSso(continueTo, options)` reading `email` when `invited=1`; `gateway.test.ts`/`session-guard.test.ts` cases. Commit `MP-11953: portal forwards the invited address as login_hint`.

---

## Part I — e2e (MP-11954) · spec §8

- [ ] I1 identity-service: `portalroles/api/PortalRoleGrantController.java` `PUT /portal-roles/grants` body `{vendor_namespace, email, role}` upsert (behind the gateway header like every route; `EndUserId` not required — document as an operator/provisioning surface), `PortalRoleGrantControllerTest`, `PortalRoleGrantPersistenceIT` upsert case. Commit `MP-11954: portal role grant upsert for provisioning`.
- [ ] I2 shop-ui web-checkout-test: `e2e/utils/portal-role-grant.ts` (`grantPortalAdmin(request, email, vendorNamespace)` → `PUT ${process.env.E2E_IDENTITY_SERVICE_URL}/portal-roles/grants` with `X-Gateway-Client: platform-gateway`), `e2e/utils/portal-invitation.ts` (`inviteViaPortal(page, emails)` driving `/en/members` invite dialog by ids — read `InviteEmailsModal.tsx` for stable ids/labels; `expectAcceptedBanner(page)`), `e2e/tests/portal-invitation.spec.ts` with four `test(...)` cases per spec §8, `test.skip(!process.env.E2E_IDENTITY_SERVICE_URL, 'needs identity-service (MP-11956) reachable via E2E_IDENTITY_SERVICE_URL')`, screenshots via `page.screenshot({ path: test.info().outputPath(...) })` per step; `e2e/docs/MP-11954-portal-invitation-plan.md`. Commit `MP-11954: invitation flow e2e specs (variant 1, 2a, 2b, expired/resend)`.

---

## Part J — Finish

- [ ] J1: In every repo `git push -u origin topic/main/MP-11943_invitation-mails`; draft PRs with §0 gate blocks (marketplace), CI notes (portal, shop-ui), links to conclave PR #4; update conclave PR #4 body with all links.
- [ ] J2: conclave: commit the plan and the plan-eng-review notes.

## Self-review

- Spec coverage: §4.1–4.3 → A1–A3; §9 → A4; §4.2, §4.5 → B1–B2; §4.3 → B3; §4.4 → C1–C2; §5.4 → D1; §5.2 → D2–D3; §5.3 → D4–D5; §5.5 → E1; §5.6 → E2–E3; §5.7 → F1–F2; §6 → G1–G3; §7 → H1–H3; §8 → I1–I2; §12 glossary/ADRs → B1, C2, E2, G2.
- Placeholder scan: no TBD/TODO; D3 contains a worked-through design correction (event carries the rendered URL) — carried into D2's record shape (`MagicLink(String url, DoubleOptInData data)`): **apply that shape in D2 directly.**
- Type consistency: `RedirectTarget.path()` used by D1, D2, E3, F1; `MailPurpose.INVITE_*` in D4, E1, E3; `MembershipActivationResult` in G2/G3; `MembershipInvitedMessage` in E3; `InviteBody(emails, locale)` in C1/B3.
