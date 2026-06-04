---
name: threat-model
description: Create structured threat-modelling artifacts for a local repository using a gated, human-reviewed workflow. Use when asked to assess a repository, feature, service, or system for security threats, perform a STRIDE-oriented analysis, and classify assets using a confidentiality, integrity, and availability (CIA) matrix.
---

# Threat modelling workflow

Perform a structured threat modelling exercise for the scoped part of the local repository.

The skill is for analysis and report generation only.
Do not modify application code, configuration, infrastructure, or existing repository files in place.
Treat all outputs as draft artifacts for human review and accountability.

This workflow has two main phases, and those phases are gated. Do not proceed from one gated phase to the next until the user has reviewed the outputs and either:
- approved them, or
- provided corrections, or
- supplied updated files to replace them.

## Core operating rules

- Work from the user's scoped directions first.
- Inspect the repository only as needed to understand architecture, components, data flows, trust boundaries, assets, and entry points.
- Be explicit about assumptions when repository evidence is incomplete.
- Ask focused follow-up questions only when the missing information materially affects correctness.
- Generate a folder with threat modelling artifacts.
- Keep output structured and consistent across runs.
- Do not present conclusions as authoritative facts when they are inferred from partial repo evidence.
- Remind the user that the report is an input to human review, not an approved security decision.
- Treat reviewed outputs from earlier phases as the canonical inputs to later phases.
- If the user corrects an earlier artifact, update downstream artifacts to match before continuing.

## User Introduction

- If the user seems uncertain about how the threat modelling process works, give a short introduction with the following information:
> Threat modelling is performed in discrete phases:
> - **Phase 1: Information gathering** - Key information is gathered from the user and the repository focusing on identifying and classifying information assets, and mapping out the overall system design.
> - **Human Review** - The collected information must be reviewed, corrected and clarified if/when needed, and explicitly approved by human developers.
> - **Phase 2: STRIDE threat modelling** - Once the input information is approved, the STRIDE method is used to identify and prioritize possible threat scenarios and mitigations
> The phases can be performed in separate sessions, as long as the artifacts from phase 1 and review comments are supplied as input to Phase 2.
> **Note**: If you are running the skill in a monorepo with several build targets, make sure to be specific on the desired scope of the threat modelling.

## Required output folder

Create a dedicated folder for generated artifacts unless the user specifies otherwise:

- `stage/threat-model-report/`

Write the following artifacts:

1. `README.md`
   - concise overview
   - scope
   - assumptions
   - workflow status
   - artifact index

2. `architecture.mmd`
   - mermaid system model using stride-oriented entity types and trust boundaries

3. `asset-classification.md`
   - asset inventory
   - CIA classification
   - classification rationale
   - open questions

4. `report.md`
   - full threat modelling report

5. `threats.csv`
   - machine-readable threat register

6. `mitigations.csv`
   - machine-readable mitigation register

If the environment or workflow does not permit file creation, produce the same contents inline and clearly label each artifact.

## Gated workflow

Follow this exact sequence. Note that the user might invoke this skill in different ways.
In the normal case, the user expects the workflow to start at Phase 1. In some cases, the user may invoke the skill separately after having performed the Gate 1 review.

If input is unclear, interact with the user to establish which path is expected.
When a Phase 1 review has been performed, ensure you agree with the user on where to find the reviewed input material.

## Phase 1: Prepare for review

### Step 1.1 : define scope and objectives

Start by clarifying the threat modelling target from the user's directions.

Capture:
- system, feature, service, or workflow in scope
- out-of-scope areas
- security objectives
- intended users and actors
- deployment or runtime context if relevant
- requested level of detail:
  - architecture-level
  - feature-level

If scope is too broad, narrow it with the user before continuing.

Document the result in `report.md` under:
- Scope
- Objectives
- Out of scope
- Assumptions

### Step 1.2: identify and classify assets

Identify what needs protection.

Capture at least:
- data assets
- system capabilities
- privileged operations
- administrative functions
- secrets and credentials
- integration trust relationships

For each asset:
- assign a stable asset ID such as `A1`, `A2`
- assign an asset type:
  - data
  - capability
  - credential
  - administrative function
  - trust relationship
  - infrastructure
- describe why it matters
- identify likely owners or stakeholders when known

#### CIA classification requirement

Classify each asset on three axes using these scales:

**Confidentiality**
- `1` Public
- `2` Internal
- `3` Confidential
- `4` Restricted / Highly sensitive

**Integrity**
- `1` Negligible
- `2` Medium
- `3` High
- `4` Critical

**Availability**
- `1` Negligible
- `2` Medium
- `3` High
- `4` Critical

**Asset classification**

For each asset, include:
- confidentiality classification
- integrity classification
- availability classification
- short rationale tied to the scale definitions

Do not invent certainty when evidence is weak.
If classification is materially uncertain:
- choose the best-supported provisional classification
- mark the rationale as provisional
- add an open question for human review

Write the result to `asset-classification.md` and also include the approved version in `report.md`, after review.

**Common asset categories (starting guidance, adjust per project)**

Use these as a baseline; tune to the product's actual risk profile and any internal data-classification policy.

| Category | C | I | A |
| --- | --- | --- | --- |
| Source code and proprietary algorithms | 3 | 4 | 3 |
| Credentials, API keys, secrets | 4 | 4 | 3 |
| PII (user accounts, contact data) | 4 | 3 | 3 |
| Payment / financial transaction data | 4 | 4 | 4 |
| Customer / business records | 3 | 3 | 3 |
| Authentication & authorization data (tokens, sessions) | 4 | 4 | 3 |
| Public marketing content | 1 | 2 | 2 |

#### Required output structure for asset classification

Use a table with at least these columns (column label in parentheses):
- asset_id
- asset_name
- asset_type
- description
- confidentiality (C)
- integrity (I)
- availability (A)
- rationale
- review_status

Set `review_status` to:
- `pending`
- `approved` (after successful review gate)

### Step 1.3: create the system model

Build a system model from repository evidence, user guidance, and the asset classification.

Identify and document:
- external interactors
- processes
- data stores
- trust boundaries
- data flows
- privilege boundaries
- user roles when relevant
- external dependencies

Create a Mermaid diagram in `architecture.mmd`.

#### Diagram requirements

Use stable IDs:
- external entities: `EE1`, `EE2`
- processes: `P1`, `P2`
- data stores: `DS1`, `DS2`
- trust boundaries: `TB1`, `TB2`
- data flows: `F1`, `F2`

Use labels consistently so threats can reference design elements directly.

Prefer clarity over visual completeness.
Include only elements relevant to the scoped exercise.

#### STRIDE-oriented entity typing requirement

The diagram must explicitly indicate the typical entity types used in threat modelling diagrams.

Every node must be visibly typed as one of:
- external entity
- process
- data store
- trust boundary container

Use naming or labels that make the type explicit, for example:
- `EE1: Mobile User`
- `P1: Auth Service`
- `DS1: Bookings Store`

Do not produce a generic architecture diagram with unlabeled boxes only.
The purpose of the diagram is to support STRIDE analysis.

#### Diagram content requirements

The diagram must show:
- which actor or external entity initiates each meaningful interaction
- where data is stored
- where privileged actions occur
- where secrets or tokens are handled
- where trust boundaries are crossed
- enough flow detail that later STRIDE threats can reference components and flows precisely

Also include the Mermaid diagram in `report.md`, together with a legend explaining the acronyms used in labels (EE, P, DS, TB and F).

If the repository does not fully reveal the architecture, create the best-supported model possible and add an `Assumptions` subsection.

### Step 1.4: Present the artifacts for review

Stop after producing `asset-classification.md` and `architecture.mmd`.

Do not perform STRIDE yet.

At this point:
- present the asset classification for human review
- present the system diagram for human review
- ask the user to approve it or provide corrections to both artifacts
- only continue when the asset classification and architecture are explicitly approved or clearly finalized by the user

Record the gate outcome in `README.md` and `report.md` as:
- `Gate 1 status: pending review`

### Gate 1: mandatory human review of asset classification and system

Stop after producing `asset-classification.md` and `architecture.mmd`.

Do not perform STRIDE yet.

At this point:
- if the user provides updated files or edited content, treat those as the new canonical asset inputs
- revise `asset-classification.md` accordingly
- revise `architecture.mmd` and the matching section in `report.md`

Record the gate outcome in `README.md` and `report.md` as:
- `Gate 1 status: pending review`
- `Gate 1 status: approved`
- `Gate 1 status: approved with updates`

## Phase 2: STRIDE Threat modelling

### Step 2.1: identify entry points

After Gate 1 review is complete, identify entry points from the approved architecture and approved asset inventory.

Identify:
- APIs
- UI endpoints
- message consumers
- background jobs with externally influenced inputs
- file upload paths
- webhooks
- admin interfaces
- third-party integrations
- network exposure points
- protocol or channel interfaces

Document entry points in `report.md` using stable IDs such as:
- `EP1`, `EP2`

For each entry point, include:
- entry point ID
- name
- type
- related process or data flow IDs
- source actor or system
- why it is security-relevant

### Step 2.2: apply stride to identify threats

Use the approved asset classification and approved system model as the required inputs for STRIDE.

For each relevant external entity, process, data flow, data store, trust boundary, asset, and entry point, evaluate STRIDE:
- **S – Spoofing**
- **T – Tampering**
- **R – Repudiation**
- **I – Information Disclosure**
- **D – Denial of Service**
- **E – Elevation of Privilege**

Generate threats with unique IDs such as `TM-001`, `TM-002`.

Each threat must include:
- Threat ID
- STRIDE category
- Title
- Affected design element IDs
- Related asset IDs
- Related entry point IDs
- Threat scenario
- Preconditions
- Potential impact
- Existing controls observed in repo, if any
- Likelihood: Low / Medium / High
- Impact: Low / Medium / High
- Risk rating derived from likelihood and impact
- Proposed mitigations
- Residual risk
- Open questions or assumptions

Threat descriptions must be concrete and architecture-aware.
Avoid generic textbook threats unless they clearly apply to the approved design.

Every threat must trace back to one or more approved inputs:
- approved asset IDs
- approved diagram element IDs
- approved entry point IDs

### Phase 2.3: assess and prioritize threats

Estimate:
- likelihood: Low / Medium / High
- impact: Low / Medium / High

Then assign an overall priority such as:
- High
- Medium
- Low

Prioritize based on realistic exploitability and business or security consequence, not only theoretical possibility.

When scoring, consider:
- exposure of the entry point
- attacker preconditions
- privilege required
- detectability
- blast radius
- sensitivity of affected assets
- CIA classification of impacted assets when relevant

Document the prioritization rationale briefly.

### Phase 2.4: propose mitigations

For each threat, identify controls that reduce likelihood or impact.

Common mitigation categories include:
- authentication
- authorization
- input validation
- output encoding
- encryption
- key management
- audit logging
- monitoring and alerting
- rate limiting
- isolation
- hardening
- secret handling
- dependency controls
- operational safeguards

Map mitigations back to specific threats by ID.

For each mitigation, include:
- Mitigation ID such as `M-001`
- Related threat IDs
- Description
- Type:
  - preventive
  - detective
  - corrective
- Implementation notes
- Priority
- Residual risk after mitigation

Do not imply that mitigations are already implemented unless confirmed by repository evidence.

### Phase 2.5: create the report

Create `report.md` with the following structure:

# Threat model report

## 1. Scope and objectives
## 2. System overview
## 3. Reviewed asset classification
## 4. Reviewed architecture diagram
## 5. Trust boundaries
## 6. Entry points
## 7. Threat analysis
## 8. Threat prioritization
## 9. Proposed mitigations
## 10. Residual risks
## 11. Assumptions and open questions
## 12. Human review note

The human review note must state that:
- the report is generated from repository evidence, user guidance, and reviewed intermediate artifacts
- findings may include inference and incomplete information
- humans are accountable for validating scope, architecture accuracy, classification decisions, threat relevance, and mitigation decisions
- reviewed artifacts should be published to the relevant product repository with documented review notes and performers.

Add the following table at the end of the document for human reviewers to fill in:
```markdown
| Date      | Reviewed by            | Comments |
|-----------|------------------------|----------|
| yyy-mm-dd | Reviewer A, Reviewer B |          |
```

## Artifact formats

### `threats.csv`

Use these columns:
- threat_id
- title
- stride
- affected_elements
- assets
- entry_points
- likelihood
- impact
- risk
- existing_controls
- proposed_mitigations
- residual_risk
- assumptions

### `mitigations.csv`

Use these columns:
- mitigation_id
- threat_ids
- title
- description
- type
- priority
- status
- residual_risk_note

Use default status `proposed`.

## README requirements

`README.md` must contain:
- scope summary
- artifact list
- workflow phase summary
- Gate 1 status
- note on whether STRIDE has started
- assumptions affecting confidence

Example statuses:
- `STRIDE status: not started pending review gates`
- `STRIDE status: in progress`
- `STRIDE status: completed using approved artifacts`

## Analysis guidance for local repositories

When evaluating the repo:
- inspect directory structure, service boundaries, config, interface definitions, infra manifests, API routes, schemas, and integration points
- prefer direct evidence from the repository over assumptions
- use README files, deployment manifests, route definitions, queue consumers, IAM or auth configuration, and data model definitions as signals
- when architecture is ambiguous, record assumptions instead of overstating certainty
- limit analysis to the scoped area and immediate dependencies
- avoid broad speculative claims about unrelated repository areas

## Output quality bar

The output must be:
- traceable from threats to approved architecture elements
- traceable from threats to approved assets and entry points
- concrete rather than generic
- internally consistent across IDs and labels
- easy for humans to review and edit
- explicit about uncertainty
- aligned with the CIA classification scale for confidentiality, integrity, and availability decisions

## Interaction pattern

Use this sequence with the user:

1. Confirm scope and objective
2. Identify and classify assets using the CIA scale
3. Build or update the system model using identified assets
4. Stop for Gate 1 human review
5. Identify entry points from the approved model
6. Generate STRIDE threats
7. Prioritize threats
8. Propose mitigations
9. Produce or update the artifact folder

Keep questions focused and minimal.
Do not block the whole exercise on missing details unless they are essential.
Use provisional markers where needed and continue until a review gate is reached.

## Review-gate behavior

When a review gate is reached:
- clearly state what is ready for review
- state what has not yet been done
- request approval or corrected inputs
- do not continue automatically to the next gated phase

When the user provides updated files or text:
- replace the relevant draft artifact content with the updated version
- preserve stable IDs where possible
- call out any downstream impact
- continue only after the updated artifact is accepted

## Refusal boundaries

Do not claim the system is secure.
Do not approve production readiness.
Do not replace formal security review, architecture review, penetration testing, or risk acceptance processes.
Do not make code or configuration changes as part of this skill.
