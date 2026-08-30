# Communication Manual

**Version:** 2.1.1
**Status:** Implementation-ready methodology contract for V1
**Created:** 2026-08-29
**Updated:** 2026-08-29
**Author:** Elena Muravyeva
**Primary audience:** Adults 25–45, including high-achieving professionals, technical leaders in transition, immigrant professionals, and adults practising difficult workplace, family, friendship, and intimate-partner conversations
**Evaluation markets:** English-language Canada and United States
**Canonical format:** Markdown knowledge base
**Contents:** Sections 1–18: core methodology, Canada/USA calibration, professional contexts and tools, personal/relational domain layer, validation, and maintenance rules

---

## Decisions in force

```yaml
id: manual_decisions
type: principle
priority: high
```

| Decision | Rule |
|---|---|
| Country selection | Every scored scenario carries `evaluation_market: canada | usa`; user profile supplies the default and each practice may override it |
| Canada vs USA | Both are treated as broadly low-context North American environments; USA is relatively more explicit/direct on average, Canada relatively more relationally mitigated in many contexts; neither is a deterministic style |
| Country vs room | Scenario + counterpart + domain/relationship override country baseline |
| Cultural score | No Cultural Fitness score; contextual calibration is narrative and affects only existing dimensions through their behavioural ceilings |
| Register | Retained as a room interaction profile (`direct | balanced | indirect`); `indirect` is a legacy key meaning mitigated-explicit, not high-context or vague |
| L2 fairness | Accent, grammar, fluency and filler/rate norms are not quality dimensions; timing/rate/fillers never feed clarity/assertiveness directly |
| Practice modes | Counterpart remains in character; guidance is a separate layer |
| Primary measure | Scenario objective first; style dimensions second |
| Personal vs professional | Same core principles; different weighting of relational, power and timing variables |
| Personal communication | First-class V1 domain: relational objectives, relationship-specific counterpart rules, eleven relational contexts, six personal playbooks, and dedicated validation cases |
| Acoustic thresholds | No fixed culturally diagnostic WPM, pause or intensity thresholds without empirical validation |
| Semantic Response | A derived reconstruction of one human response from raw VAD fragments; boundaries resolve to `merge`/`separate`/`ambiguous` under a versioned grouping algorithm, never a fixed rule in this Manual (`ev_04`) |
| Unsupported signals | A signal with no verified measurement source in the current runtime is `not_available`, never estimated from general impression (`sig_00`) |

This table is itself a retrievable block (`manual_decisions`) — see `ret_runtime_contract` below for why that matters and `ret_01` point 6 for how block versioning works.

---

# 1. Purpose, Scope and Non-Goals

## 1.1 Purpose

```yaml
id: purpose
type: principle
priority: high
```

This Manual defines the communication methodology the application uses to
conduct practice conversations and to interpret what the user did in them.

The application exists so that users can **practise** communication in
realistic conversations, not study it. Every rule in this Manual is written to
be applied to a specific recorded exchange, against a specific situation, for a
specific user. A rule that cannot be applied to an observable exchange does not
belong in this Manual.

## 1.2 What "good" means here

```yaml
id: definition_of_good
type: principle
priority: high
```

There is no ideal response. The system never evaluates whether the user matched
a model phrase.

The system evaluates **whether the user's behaviour served the communication
objective of this situation**, given the register of the room (§4) and the
user's own baseline direction (§5).

Consequences, all binding:

1. Several materially different responses can be equally effective in the same
   situation. Where this is true, the Manual says so.
2. A response that is polished but does not move the objective is not a good
   response.
3. A response that is awkward but moves the objective is not a bad response,
   and must not be scored as one.
4. The system describes the *principle of effective action* and offers
   alternatives as illustrations, never as the required wording.

## 1.3 The authenticity stance

```yaml
id: translation_not_fabrication
type: principle
priority: high
```

The target user's central objection to communication training is that learning
influence means becoming fake. The methodology answers this objection directly
rather than leaving it to marketing copy.

**Skill is translation, not fabrication.** The system does not change what the
user wants to say, what they believe, or who they are. It works on the form in
which their meaning reaches the other person.

Binding consequences:

1. Feedback never proposes that the user adopt a persona, a stock personality,
   or a communication style described as generally superior.
2. Where a user's phrasing is idiosyncratic but effective, it is credited as
   effective. Idiosyncrasy is not an error.
3. Suggested alternatives must preserve the user's stated intent. A suggestion
   that would have the user say something they did not mean is invalid,
   regardless of how well it would have worked.
4. When the user's intent is unclear from the transcript, the system asks or
   marks the point `uncertain`. It does not assume an intent and then coach
   toward it.

## 1.4 Scope

In scope: everyday professional and personal conversations in which the
communication itself is the difficulty — receiving and giving criticism,
disagreement, boundaries, unfair accusation, hostility, upset people, difficult
requests, and the reading of indirect signals.

The primary cultural setting is English-language communication in North America.
Canada and the United States are treated as distinct evaluation markets (§4), while
country is never used as a deterministic proxy for an individual, workplace, or relationship.

## 1.5 Non-Goals

```yaml
id: non_goals
type: principle
priority: high
related: [safety_03]
```

The system does not:

- diagnose personality, psychological conditions, or mental health states;
- assert emotions as fact, or infer intent, sincerity, or truthfulness;
- evaluate accent, pronunciation, grammatical accuracy, vocabulary range, or
  the user's first language (`safety_04`);
- score the user as a person, or produce any trait label;
- teach manipulation, or techniques whose function is to obtain compliance by
  concealing intent;
- substitute for therapy, legal advice, HR process, or any professional
  intervention (§2).

Every one of these is enforced downstream by a rule in §2 or §3. This list is
the summary, not the mechanism.

## 1.6 How this Manual is used at runtime

```yaml
id: ret_runtime_contract
type: principle
priority: high
related: [ret_01, ret_metadata_schema]
```

The Manual is a versioned knowledge base, separate from application code. The
evaluator retrieves only the blocks whose metadata match the current
situation: `context_type`, `evaluation_market`, `register`, `domain`, `channel`, `relationship`,
`user_direction`, `signals`, `min_duration` — see `ret_metadata_schema` for the exact
meaning, cardinality and inheritance of each of these fields.
Every stored interpretation and evaluation records the `manual_version` of the
whole Manual under which it was produced (never a per-block version — see
`ret_01` point 6).

This paragraph, and the `manual_decisions` table above it, are themselves
retrievable blocks precisely so that the runtime contract they describe is not
lost the moment retrieval starts returning fragments instead of the full
document — a rule that would otherwise violate `ret_01`'s own "every rule must
survive being retrieved alone" requirement.

## 1.7 Retrieval contract and rule-writing standard

```yaml
id: ret_01
type: principle
priority: high
related: [ret_runtime_contract, ret_metadata_schema]
```

**The atomic retrievable unit is a block carrying an `id`, and a block is never
split across chunks.** Everything needed to apply a rule correctly — its scope,
its exceptions, and the situations it does and does not cover — must sit inside
that block.

**Every rule must survive being retrieved alone.** A rule whose meaning depends
on the heading above it, on the section it sits in, or on the rule before it
will eventually be misapplied, because the evaluator receives fragments and not
the document. Concretely:

1. A prohibition names the situations it applies to, inside the rule. Where a
   rule restricts a behaviour that is taught elsewhere in the Manual, it says
   so explicitly, or read alone it will appear to prohibit the behaviour
   everywhere.
2. Cross-references use stable IDs — `safety_01`, `reg_04`, `tool_00` — never a
   section number alone. Section numbers move between versions; IDs do not.
3. A reference to material not yet written names the section and the sprint,
   never a number. A number assigned before the section exists will be wrong
   when it does.
4. A rule with a temporary scope carries an explicit expiry condition naming
   the version or section that ends it. Interim rules without expiry conditions
   become permanent by accident.
5. A rule whose metadata references a `context_id` that is not yet specified
   will never be retrieved. Such rules are marked `status: dormant` so that the
   gap is visible in the document rather than silent in production.
6. **Version inheritance, binding.** Every parsed block inherits the version of
   its parent Manual version. A block never carries an independent
   `manual_version` field of its own — the document-level version (this
   document's header, and the version stamped on a `manual_versions` row at
   ingestion time) is the only authoritative version, for every block it
   contains, without exception. A block-level version field is prohibited
   precisely because it can drift from the document version it actually ships
   inside — which is exactly what happened to `purpose` in v2.1 (it carried a
   stale `manual_version: 2.0` inside a document whose header already said
   2.1), and is the reason this rule exists.

## 1.8 Metadata schema contract

```yaml
id: ret_metadata_schema
type: retrieval_contract
priority: high
related: [ret_01, ret_runtime_contract]
```

This block defines the intended meaning of every metadata field used across
this Manual's blocks, so a future parser/retriever has one place to resolve
what a field means, whether it identifies a block or filters a query, whether
it is a scalar or an array, whether it is optional, and whether it is read
from the block itself or inherited from the scenario currently being
evaluated. This is a methodology/retrieval contract, not a software schema —
it does not prescribe column types, storage, or validation code.

**Fields that identify a block** (scalar, one per block):

| Field | Meaning |
|---|---|
| `id` | The block's own stable identifier. Unique across the whole Manual, for every block, of every type. Never reused, never renumbered. |
| `type` | The kind of block (`principle`, `safety_rule`, `interpretation_rule`, `feedback_rule`, `dimension`, `dimension_rule`, `counterpart_rule`, `context`, `tool`, `playbook`, `signal`, `cultural_rule`, `validation_rule`, `example`, `retrieval_contract`). |
| `priority` | `high` \| `medium` \| `low` — retrieval/attention weighting, not a correctness signal. |
| `status` | Optional. `dormant` marks a block whose metadata references a `context_id` (or other identifier) not yet specified elsewhere in the Manual (`ret_01` point 5). Absent means active. |
| `context_id` | Present only on a `type: context` block. The stable short identifier OTHER blocks reference via `context_type` (single reference) or `contexts` (list). Identity, not a filter. |
| `tool_id` | Present only on a `type: tool` block. The stable short identifier other blocks reference via `tools` (list) or a scenario's `target_technique`. |
| `signal_id` | Present only on a `type: signal` block. The stable short identifier other blocks reference via `signals` (list). |

**Fields that are filters/references** (used by a block to say what it applies to, or by a retrieval query to select blocks):

| Field | Shape | Meaning |
|---|---|---|
| `context_type` | scalar | This block belongs to exactly ONE context — a reference to a `context_id` defined elsewhere. Used by playbooks, validation/example blocks, and scenario specifications. Never used by a `type: context` block to name itself — that block uses `context_id` instead. |
| `contexts` | array | This block (typically a `tool` or `signal`) applies to MULTIPLE contexts — a list of `context_id` references. Distinct from `context_type`: a list of applicability, not a single-owner reference. |
| `tools` | array | List of `tool_id` references a playbook/context depends on or makes available. |
| `signals` | array | List of `signal_id` references a rule depends on as evidence. |
| `evaluation_market` | scalar (block) / scalar (scenario) | `canada` \| `usa`. On a `cultural_rule` block, which market baseline it describes. On a scenario, the declared training environment — inherited by every retrieval for that practice session unless overridden. |
| `domain` | scalar | `workplace` \| `personal` \| `mixed` \| `networking` \| `public`. On a context/playbook block, which domain(s) it is written for — `mixed` means the block is genuinely written to apply across domains, not "domain unknown." On a scenario, the declared domain for that practice. |
| `objective_type` | scalar | `instrumental` \| `relational` \| `mixed` \| `scenario_specific`. On a scenario, always one concrete value. On a shared context/playbook block that spans domains with genuinely different objective shapes, `scenario_specific` is a valid, explicit value meaning "no safe universal default exists — the scenario must declare its own," and must never be silently omitted or defaulted. |
| `register` | scalar | `direct` \| `balanced` \| `indirect` — an interaction-profile field, inherited from the scenario at evaluation time; rule blocks reference it in prose (`reg_*` family) rather than declaring it as their own metadata. |
| `relationship`, `power_relation`, `familiarity`, `channel` | scalar | Scenario-level fields (see `obj_01`). Rule blocks reference them in prose where relevant; they are not block-identifying metadata. |
| `related` | array | Cross-references to other block `id`s for a human/parser following the document's own internal links. Not a retrieval filter. |
| `min_duration` | scalar (seconds) | The minimum practice duration for which this block's content is assessable at all. Absent means no minimum. Inherited from the scenario's selected duration at evaluation time, compared against the block's own value. |
| `user_direction` | scalar | `under_assertive` \| `over_assertive` \| `mixed` \| `unknown`. A profile/context calibration input — never a block identity; no block is identified or looked up by a `user_direction` value. It is inherited from the user's profile/context state at evaluation time (see `dir_01`–`dir_09`), never declared as a rule block's own metadata. `unknown` is a valid, expected value (`dir_06`): evaluation proceeds normally under it, and only style-calibration advice is withheld. |
| `language_background` | scalar | `L1` \| `L2` \| `unknown`. A profile/session fairness input, not a communication-quality dimension. It is used only where a Manual rule explicitly requires fairness calibration (`safety_04`) — it never independently drives an interpretation or evaluation outcome on its own, and it is never itself a filter that selects which rules apply. |

**What inherits from the current scenario/session/profile rather than from the block itself**: `evaluation_market`, `domain`, `objective_type`, `register`, `relationship`, `power_relation`, `familiarity`, `channel`, `user_direction`, `language_background`, and the selected duration are all properties of the scenario or the user's profile at evaluation time — a rule block's own `domain`/`evaluation_market` metadata (where present, e.g. on `cultural_rule` blocks) describes what the block is ABOUT or FOR, and is matched against the scenario's declared values; it is never itself the source of truth for the current practice.

**Matching semantics — binding.** A future retriever must not use naïve exact-match filtering; the following govern how a block's metadata is matched against the current scenario/session/profile state.

**A. `domain` matching.** For BLOCK APPLICABILITY: `block.domain: mixed` means the block is eligible for retrieval under **both** `scenario.domain: workplace` **and** `scenario.domain: personal` (and `mixed`/`networking`/`public`), unless a narrower, more specific block explicitly overrides it for the current context — `mixed` on a block means "genuinely written to apply across domains," never "domain unknown" or "domain not yet classified." For a SCENARIO itself, `domain: mixed` means the scenario genuinely spans more than one domain, and the scenario specification must state which domain governs the objective and any institutional-norm calibration, consistent with `dom_00` — a scenario is never left to resolve its own domain ambiguity implicitly.

**B. `objective_type: scenario_specific` matching.** This value is valid on a shared context/playbook block (see, for example, `ctx_criticism_fair`, `ctx_disagreement`, and their playbooks) — it means the block imposes no universal objective-type default and the scenario itself must declare one concrete value (`instrumental` \| `relational` \| `mixed`). It is **not** a valid final value for a scenario's own `objective_type` — a scenario must always resolve to one concrete value. A block carrying `objective_type: scenario_specific` must **not** be excluded from retrieval merely because the current scenario declares `objective_type: instrumental`, `relational`, or `mixed` — the block's own field describes whether it imposes a default, not which scenarios it applies to.

**C. Missing optional filter metadata means universal.** If an applicable rule block does not declare an optional filter field — `evaluation_market`, `domain`, `register`, `relationship`, `objective_type`, or any other field in this contract marked optional — the absence means the block is universal with respect to that field: it applies regardless of the current scenario's value. Absence is never treated as a mismatch that excludes the block. This is essential for the Manual's universal rules (safety, evidence, feedback-structure principles in particular), none of which declare `domain`/`evaluation_market`/`register` at all, and all of which must always be retrieved regardless of scenario metadata.

**D. Narrower rules do not delete universal ones.** A more specific matching block never automatically overrides or removes a more universal one from the retrieved set. A universal safety rule, a context-specific rule, and a country-specific calibration rule may all apply simultaneously to the same exchange unless this Manual explicitly defines precedence or override behaviour for that specific combination (as `reg_03` already does for room-norm precedence, and as `safety_01`/`safety_02` already do by sitting above §3–§5). Retrieval returns the union of everything that matches, not the single "most specific" block.

---
# 2. Scope Boundaries and Safety

This section is placed before the interpretation rules because it constrains
them. Nothing in §3, §4 or §5 may override anything here.

## 2.1 Out-of-scope situations

```yaml
id: safety_01
type: safety_rule
priority: high
```

The following are **not** treated as communication problems and are not
practised, coached, or scored as skill deficits:

- workplace harassment, including sexual harassment;
- discrimination or differential treatment based on a protected characteristic;
- threats of violence, intimidation involving physical safety, or stalking;
- intimate partner abuse, including coercive control and financial control;
- any situation involving the safety of a minor;
- situations where the user describes being in immediate danger.

**Rationale.** These situations have communication surfaces, but their
substance is not a communication deficit. Framing them as one tells the user
that better technique would have prevented what happened, which is both false
and harmful.

## 2.2 Behaviour when out-of-scope content appears

```yaml
id: safety_02
type: safety_rule
priority: high
related: [safety_01, safety_05]
```

**Scope of this rule.** It applies only to the situations listed in `safety_01`
— harassment, discrimination, threats of violence, intimate partner abuse,
danger to a minor, and immediate danger. It does not apply to any other
context. De-escalation, acknowledgment, empathy and acceptance of
responsibility are core curriculum everywhere else in this Manual and are
trained directly in `criticism_fair`, `aggression` and `boundary_violation`
(§6, §7). What follows restricts them in one place only.

When out-of-scope content appears — whether written into a scenario by error or
introduced by the user during practice:

1. The system does **not** present de-escalation, acknowledgment, empathy, or
   acceptance of responsibility as the remedy **for this situation**. Offering
   them here communicates that the situation continues because the user has
   phrased things badly. That is false, and it relocates responsibility onto
   the person who was harmed. Acceptance of responsibility is additionally
   prohibited here because it can lead a user to take on what is not theirs —
   the same rule as "do not accept false responsibility", applied from the
   other side.
2. The system does not score the exchange on the standard dimensions.
3. The report names the boundary plainly, in one short paragraph: what the
   system observed, that this falls outside what conversational practice can
   resolve, and what categories of response exist instead — documentation,
   boundary-setting, and escalation to a person or body with authority.
4. The system does not tell the user what happened to them, does not label it,
   and does not assess whether their account is accurate.
5. No trend data, delta, or indicator score is stored for that session.

**Exception.** A user may legitimately practise a *bounded* exchange that sits
near this line — for example, stating a boundary once, clearly, to a person who
has been persistently dismissive. Practice is permitted where the objective is
the user's own statement of a boundary, and prohibited where the implied
objective is to change an abusive person's behaviour through better technique.

## 2.3 Prohibited inferences

```yaml
id: safety_03
type: safety_rule
priority: high
related: [non_goals, ev_02]
```

The following may never appear in any indicator, dimension, summary, or comment
— not as a claim, not as a hedged suggestion, and not as a question:

| Prohibited | Permitted instead |
|---|---|
| Personality traits ("you're conflict-avoidant") | Behaviour in this exchange ("the position was stated once and then dropped") |
| Mental health or clinical language | Nothing — the topic does not appear |
| Emotion asserted as fact ("you felt anxious") | Emotion as an evidenced hypothesis, at `medium` confidence at most ("the delivery pattern is consistent with time pressure; other explanations fit equally") |
| Intent ("you were trying to avoid the question") | Effect ("the question was not answered in the following two turns") |
| Sincerity or truthfulness | Nothing |
| Comparison to other users | Comparison to the user's own prior comparable attempts (`fb_05`) |

**Confidence cap.** No interpretation of an internal state may ever be recorded
above `medium`, in any circumstance, however strong the signal. Internal states
are not observable. This cap is absolute and is not a tuning parameter.

## 2.4 Language-background fairness

```yaml
id: safety_04
type: safety_rule
priority: high
signals: [speaking_rate, filler_candidates, response_latency]
```

A fluent second-language speaker produces more planning pauses, more filler
candidates, and a lower and more variable speaking rate than a first-language
speaker at the same level of confidence and competence.

Binding rules:

1. `speaking_rate`, `filler_candidates` and `response_latency` **must not feed
   `clarity` or `assertiveness`** in any weighting.
2. These signals may inform delivery commentary only, and only where the
   commentary is about function, not fluency — for example, whether a filler
   cluster preceded an abandoned clause, not how many fillers occurred.
3. Where `language_background: L2` or `unknown`, any interpretation resting
   primarily on rate or fillers is capped at `low` confidence.
4. Accent, pronunciation, grammatical accuracy and vocabulary range are never
   observed, never stored, and never commented on — including favourably.
   Praise on these dimensions is also prohibited, because it establishes them
   as a dimension of evaluation.

**Rationale.** The largest and most commercially important user segment is
professionals operating in a second language and a second culture. A product
that quietly penalises an L2 speech profile under the label "clarity" confirms
the precise belief that segment arrived with.

## 2.5 Counterpart content limits

```yaml
id: safety_05
type: safety_rule
priority: high
```

The AI counterpart may express hostility, unfairness, dismissiveness,
impatience and pressure. It may not, under any parameter setting, produce:

- slurs, or hostility directed at a protected characteristic;
- threats of physical harm;
- sexual content or sexualised pressure;
- content in the `safety_01` list, including in response to a user who
  introduces it.

## 2.6 User distress

```yaml
id: safety_06
type: safety_rule
priority: high
```

If the user's speech indicates acute distress rather than practice difficulty —
for example, describing the scenario as something happening to them now and
showing signs of being overwhelmed — the system ends the practice, does not
score it, and responds plainly: what it noticed, that the practice is stopped,
and that support from a person is available and appropriate. It does not
continue the roleplay, does not analyse the distress, and does not offer a
technique.

---
# 3. Evidence and Interpretation Rules

## 3.1 The four layers

```yaml
id: ev_01
type: interpretation_rule
priority: high
```

Every statement the system makes belongs to exactly one of four layers, and the
layers are never merged in a single sentence.

| Layer | Definition | Example |
|---|---|---|
| **Raw evidence** | Measured or transcribed fact | `response_latency_ms = 1600`; user said "I will write down all the steps" |
| **Semantic response** | One human reply, reassembled from however many raw turns the voice-activity detector produced | The user's full reply, including the two clauses split by a 900 ms internal pause |
| **Interpretation** | Contextual hypothesis, carrying a confidence level | Possibly a regulation pause, `medium` |
| **Evaluation** | Whether the behaviour served this situation's objective | The pause preceded a clarifying question rather than a counterattack, which served the objective |

**Worked example.**

- *Raw:* counterpart said "You clearly don't care whether the team succeeds";
  user latency 1500 ms; user's first words were "What happened that made you
  come to that conclusion?"
- *Semantic response:* one reply, one clause, no abandonment.
- *Interpretation:* the latency is consistent with regulation, and consistent
  with search for wording; the two cannot be separated on this evidence.
  Confidence `medium` on "not an immediate counterattack", `uncertain` on
  which internal process produced it.
- *Evaluation:* in `aggression` context the objective is to avoid escalation
  and establish what is actually being alleged; both were served.

Note what is absent: any claim about what the user felt.

## 3.2 Evidence is required and must be quotable

```yaml
id: ev_02
type: interpretation_rule
priority: high
related: [safety_03]
```

**Every claim shown to the user must be traceable to a quotable line of
transcript or a displayable measurement.** If the system cannot show the user
the exact words or the exact number behind a claim, the claim is not made.

This applies to positive claims as well as critical ones. "You handled that
well" without an anchor is prohibited on the same grounds as an unanchored
criticism: it teaches nothing and it is unverifiable.

## 3.3 No metric becomes a conclusion on its own

```yaml
id: ev_03
type: interpretation_rule
priority: high
signals: [response_latency, intra_response_pause, filler_candidates,
          speaking_rate, interruptions, relative_intensity]
```

No single measured signal, at any value, may by itself produce a conclusion
about the user's state, competence, or intent.

For every signal, the Manual must separately state: what is measured; what the
fact does **not** mean on its own; which interpretations the surrounding
context can support; and when the classification must remain `uncertain`.
Signals are specified individually in §11. **A signal may drive an indicator
score only where §11 specifies it.** A signal not specified there may appear in
a report as raw evidence attached to a semantic claim, and nothing more
(`sig_00`).

**Prohibited automatic conclusions**, listed here because they are the common
failures:

| From | Never conclude |
|---|---|
| Long latency | hesitation · nervousness · low confidence · strategic control |
| Short latency | confidence · aggression · not listening |
| High filler density | anxiety · unpreparedness · low competence |
| Low speaking rate | uncertainty · low energy |
| High speaking rate | anxiety · dominance |
| Interruption | rudeness · dominance |
| Long response | thoroughness · rambling |
| Short response | disengagement · efficiency |

## 3.4 The semantic response unit

```yaml
id: ev_04
type: interpretation_rule
priority: high
signals: [response_latency, intra_response_pause]
related: [ev_01, ev_05, ev_06, sig_response_latency]
```

Voice-activity detection fragments speech. Interpretation operates on the
**semantic response**, not on raw turns.

**Concept.** A semantic response is a derived reconstruction of one human
conversational response, assembled from one or more raw speech/VAD fragments.
It exists because a voice-activity detector routinely splits a single human
reply into multiple raw turns at ordinary mid-thought pauses, and interpreting
each fragment as if it were a separate reply would misread pause location,
latency, and content. Raw events (the fragments themselves, their timestamps,
their transcripts) are never altered, deleted, or rewritten by this process —
a semantic response is additional, derived structure layered on top of
unmodified raw evidence, consistent with the four-layer separation in `ev_01`.

**Algorithm ownership — binding.** This Manual defines what a semantic response
*means* and what evidentiary consequences follow from how confidently one was
assembled. It does **not** define the exact procedure by which raw fragments
are grouped. That procedure is a **versioned grouping algorithm**, maintained
and improved independently of this document, identified by its own
`grouping_algorithm_version`. This Manual never hardcodes a specific gap
duration, timing threshold, or other algorithm-internal parameter — those are
implementation details of one algorithm version, not methodology, and a
Manual rule that embedded one would misapply the instant the algorithm
improved.

**Boundary states.** Every boundary between two chronologically-adjacent raw
user fragments resolves, under the current grouping algorithm, to exactly one
of:

```text
merge      # the fragments are treated as one semantic response
separate   # the fragments are treated as distinct semantic responses
ambiguous  # the algorithm found no high-confidence basis for either
```

**The ambiguous state is not a merged state.** Where a boundary resolves
`ambiguous`, the fragments on either side of it remain **separate** semantic
responses unless and until a later grouping stage — a future version of the
algorithm, or a dedicated resolution pass — explicitly reclassifies the
boundary as `merge`. Interpretation must never treat an `ambiguous` boundary
as already resolved in either direction, and must never describe it as
merged.

**Consequence for interpretation confidence.** Each semantic response
adjacent to an `ambiguous` boundary may still be interpreted independently —
an `ambiguous` boundary is a reason to keep the fragments on either side of
it separate (see above), never a reason to withhold interpretation from
either one on its own. Any interpretation that materially depends on
treating the fragments across that `ambiguous` boundary as one response —
that is, on a merge that has not happened and, under the deterministic
grouping layer, will not happen — must remain `uncertain` until a later
grouping stage explicitly resolves the boundary. Grouping confidence is one
more input to the confidence assessment `ev_05` already performs, exactly
like any other source of underdetermined evidence; it introduces no separate
mechanism and no numeric or categorical confidence ceiling of its own. No
interpretation may silently treat an `ambiguous` boundary as if it had
already resolved to `merge`.

Rules for assembly and measurement:

1. Only a `merge` boundary joins raw turns into one semantic response. A
   `separate` or `ambiguous` boundary keeps them distinct (see above).
2. A silence **before** the semantic response begins is `response_latency`. A
   silence **inside** it — including a bridge gap between two fragments that
   the grouping algorithm merged — is `intra_response_pause`. These are
   different signals with different meanings and must never be pooled into an
   average. A bridge gap that does not itself meet the ordinary threshold for
   a meaningful pause is retained as technical assembly evidence only, never
   reported as a meaningful pause (see `sig_intra_response_pause`).
3. If the counterpart speaks during a user silence, the silence terminates and
   is not measured as latency; the exchange is recorded as a counterpart
   interruption instead. An actual counterpart utterance between two raw user
   fragments is, independently of the point above, always a hard boundary for
   grouping purposes — fragments separated by real counterpart speech are
   never merged into one semantic response, regardless of gap duration.
4. `response_latency` after a direct question addressed to the user is a
   different measurement from latency after a statement, and the two are not
   compared to each other.
5. Latency measurement begins at the end of the counterpart's utterance, not at
   the end of the counterpart's turn, where these differ. See `sig_response_latency`
   for the measurement-precision limitation that applies to identifying that
   endpoint in practice.

## 3.5 Confidence levels

```yaml
id: ev_05
type: interpretation_rule
priority: high
```

Confidence is assigned by evidence structure, not by impression.

| Level | Requirements |
|---|---|
| `high` | Two or more independent signal families converge; the semantic content of the response supports the same reading; the register (§4) is known; no material contradicting evidence. **Never available for interpretations of internal state** (`safety_03`). |
| `medium` | One signal family plus supporting semantic content; or two families with a minor contradiction that the context explains. |
| `low` | A single weak signal; or convergent signals in a context the Manual has not specified; or `language_background` unknown where the reading rests on rate or fillers (`safety_04`). |
| `uncertain` | Signal families conflict and the context does not resolve them; or the register is unknown and the reading is register-dependent; or the exchange is shorter than the rule's `min_duration`; or two or more interpretations fit the evidence equally. |

"Signal family" means a group of related measurements — timing, prosody,
lexical choice, structural (interruption, floor share), or semantic. Two
measurements from the same family are not convergence.

## 3.6 Uncertainty is preferred over a forced classification

```yaml
id: ev_06
type: interpretation_rule
priority: high
```

Where several reasonable interpretations fit the evidence, the system presents
them as alternatives and does not select one.

**Acceptable:** "This may have functioned as a deliberate pause, though the
available evidence does not distinguish that confidently from searching for
wording."

**Not acceptable:** "You paused because you felt unsure."

`uncertain` is a valid, displayable outcome, and the interface must be able to
show it without it reading as a system failure. An honest "the evidence does
not separate these" is a feature of the product, not a gap in it.

## 3.7 Interpretation is context-, country- and register-conditional

```yaml
id: ev_07
type: interpretation_rule
priority: high
related: [reg_03]
```

No behaviour is interpreted against a universal style norm. Interpretation consults
the scenario's declared `evaluation_market`, domain, relationship and register (§4)
before assigning context-dependent meaning to acknowledgment length, directness,
apology, hedging, credit-claiming, silence or interruption. Country is a baseline, not a
determination; stronger scenario and counterpart evidence takes precedence.

## 3.8 Evaluation is direction-conditional

```yaml
id: ev_08
type: interpretation_rule
priority: high
related: [dir_03]
```

Interpretation asks what the behaviour was. Evaluation asks whether it served
the objective **for this user**. Evaluation consults `user_direction` (§5)
before deciding whether a behaviour is progress or a problem.

The same utterance, correctly interpreted the same way, can be an achievement
for one user and a habit to interrupt for another. This is not inconsistency;
it is the difference between interpretation and evaluation.

---
# 4. Country and Context Calibration Layer

## 4.0 Governing principle

```yaml
id: reg_00
type: principle
priority: high
```

The application evaluates communication in a **declared environment**, not against a
single universal North American style.

Every scored scenario declares:

```yaml
evaluation_market: canada | usa
register: direct | balanced | indirect
domain: workplace | personal | mixed | networking | public
channel: in_person | video | phone | text | email | chat
relationship: manager | senior_leader | peer | direct_report | client | stranger | friend | partner | family
power_relation: user_lower | equal | user_higher | not_applicable
familiarity: low | established | close
```

`evaluation_market` is mandatory because the product explicitly trains users for
Canadian or U.S. interaction environments. It changes interpretation and feedback
where the Manual specifies a real contrast. It does **not** change universal rules,
and it does not create a national stereotype.

**Binding rule:** country may modify the expected *form* of effective communication;
it never changes whether personal attack, false responsibility, manipulation,
non-consensual coercion, or an unmet objective is effective.

---

## 4.1 Canada and the United States: what the Manual means

```yaml
id: reg_01
type: principle
priority: high
```

For this Manual, both English-language Canada and the United States are treated as
broadly **low-context North American environments**: important business meaning is
normally expected to become explicit rather than remain permanently implied.

The useful contrast is relative, not categorical:

- **United States baseline:** somewhat stronger preference, on average, for explicit
  position-taking, speed, self-advocacy, concise rationale, and visible ownership.
- **Canada baseline:** still explicit, but in many professional and interpersonal
  settings somewhat greater value is placed on relational cushioning, acknowledgment,
  goodwill, and a form of disagreement that preserves cooperation.

The Manual therefore does **not** use the rule `USA = low-context` and
`Canada = high-context`. That binary is prohibited.

Country is a **prior**. It is weaker than a scenario's declared interaction pattern and
weaker than observed counterpart behaviour. A Canadian startup may be more direct than
an American non-profit; a U.S. manager may prefer substantial relational framing; a
Canadian friend may speak with extreme bluntness. The evaluator must be able to handle
all three without treating them as exceptions to a stereotype.

---

## 4.2 Register is an interaction profile, not a country

```yaml
id: reg_02
type: interpretation_rule
priority: high
```

The existing runtime field `register` is retained for compatibility, but its meaning is
narrowed.

```yaml
register_axis:
  direct: >
    Explicit-direct interaction profile. Position normally arrives early; reasons
    follow; disagreement can be named directly; ownership is visible; brevity is
    normally rewarded.
  balanced: >
    Explicit but relationally calibrated. Position is clear, with enough context or
    acknowledgment to preserve cooperation.
  indirect: >
    Internal legacy key for a mitigated-explicit interaction profile. Meaning may be
    routed through a question, constraint, acknowledgment, or buffer, but the operative
    position must still become recoverable from the exchange. This key does NOT mean
    high-context culture and does NOT reward vagueness.
```

UI copy should label `indirect` as **mitigated / relationship-sensitive**, not
"high-context" or "indirect person."

---

## 4.3 Precedence: what determines the room norm

```yaml
id: reg_03
type: interpretation_rule
priority: high
```

Where several inputs differ, use this precedence chain:

1. **Scenario-declared interaction norm and counterpart style** - strongest.
2. **Observed counterpart behaviour in the current exchange** - strong, but it may not
   override a scenario red line or safety rule.
3. **Domain and relationship** - workplace vs personal, manager vs peer, close partner
   vs stranger.
4. **Power relation and channel** - seniority, phone/video/in-person, synchronous vs
   asynchronous.
5. **Work sector / organisational norms** - weak prior only.
6. **Evaluation market (Canada/USA)** - mandatory baseline, but a prior rather than a
   determination.
7. `balanced` default where the remaining interaction profile is unspecified.

**Prohibited:** `technology -> direct`, `public sector -> indirect`, `Canada -> indirect`,
`USA -> direct` as automatic scoring rules.

Work sector may help author scenarios; it may not, by itself, lower a user's score.

---

## 4.4 How country changes evaluation

```yaml
id: reg_04
type: interpretation_rule
priority: high
```

Country-specific calibration is applied only where all three are true:

1. the behaviour is listed in a country contrast rule in this section;
2. the current context makes the contrast consequential; and
3. the evidence shows the behaviour actually affected clarity, relationship, floor
   control, objective progress, or counterpart response.

Country does **not** generate an automatic deduction merely because a response is more
Canadian-looking or more U.S.-looking than the baseline.

When country matters, feedback states the mechanism:

> "Your disagreement was clear. In this Canadian workplace scenario, one brief
> acknowledgment before the disagreement would likely make the same position easier to
> receive without weakening it."

Not:

> "This is not Canadian enough."

The application has **no Cultural Fitness score**. Cultural/contextual calibration is
reported narratively and may affect an existing dimension only through the dimension's
own behavioural definition.

---

## 4.5 Country baseline: United States

```yaml
id: reg_us_base
type: cultural_rule
evaluation_market: usa
priority: high
```

Use these as **default expectations only when the scenario does not provide stronger
information**:

- make the operative point explicit;
- answer direct questions directly before adding context;
- show ownership of contributions rather than waiting for recognition;
- use concise rationale after the position where time and decision-making matter;
- treat respectful disagreement as normal rather than as a relational rupture;
- use small talk as social connection, but do not require a long relational preamble
  before a known business purpose;
- make refusals and boundaries recoverable as actual refusals, not only as hints;
- when a pause is long enough to create ambiguity about floor ownership in a fast
  professional exchange, a brief verbal marker may help;
- do not infer that directness is aggression. Aggression requires attack on the person,
  contempt, intimidation, or another semantic marker specified elsewhere.

**Personal-domain modifier.** In close personal conversations, relational repair,
validation and listening often dominate country-level preferences for speed or
position-first structure. The U.S. baseline therefore carries less weight in personal
conflict than in time-bounded workplace exchange.

---

## 4.6 Country baseline: Canada

```yaml
id: reg_ca_base
type: cultural_rule
evaluation_market: canada
priority: high
```

Use these as **default expectations only when the scenario does not provide stronger
information**:

- make the operative point explicit; Canadian calibration does not reward permanent
  ambiguity;
- preserve cooperation through concise acknowledgment, goodwill, or a relational bridge
  where disagreement, refusal, criticism, or bad news is involved;
- self-advocate without erasing team contribution, and do not erase personal ownership
  in the name of modesty;
- distinguish ritual politeness from responsibility-taking; "sorry" is not automatically
  an admission;
- allow somewhat more conversational cushioning where it serves reception, but do not
  reward cushioning that prevents the position from arriving;
- recognise "soft no", capacity language, and questions as possible vehicles for
  disagreement or refusal, while checking whether the actual meaning becomes clear;
- treat small talk and relational opening as functional trust-building in many settings,
  especially where the parties do not yet have an established relationship;
- do not infer weakness from polite mitigation, and do not infer aggression from ordinary
  U.S.-style directness without semantic evidence.

**Personal-domain modifier.** As in the United States, close personal relationships are
more strongly governed by relationship history, emotional stakes and individual style
than by national baseline.

---

## 4.7 Contrast rule: stating a position

```yaml
id: reg_position
type: cultural_rule
contexts: [disagreement, giving_negative_feedback, difficult_request,
           self_advocacy, criticism_unfair]
priority: high
```

**Universal requirement:** the evaluator must be able to identify the user's operative
position by the time the situation requires one.

- **USA baseline:** position-first is often efficient: "I don't think that timeline is
  workable. Here are the two constraints."
- **Canada baseline:** a brief bridge can improve reception: "I see why that timeline is
  attractive. I don't think it's workable with the current testing scope."
- **Effective in both:** position is explicit; no personal attack; uncertainty is stated
  only where genuine.
- **Failure in both:** framing continues and the position never arrives.

Observable evidence: position present/absent; placement relative to rationale and
acknowledgment; whether it survives pushback.

---

## 4.8 Contrast rule: disagreement

```yaml
id: reg_disagreement
type: cultural_rule
contexts: [disagreement, criticism_unfair, negotiation]
priority: high
```

- **USA:** direct naming of disagreement is normally available: "I see it differently."
- **Canada:** acknowledgment + disagreement is often a strong default where relationship
  or hierarchy matters: "I see the concern. I read the risk differently."
- **Both:** the disagreement itself must not disappear inside agreement-like language.
- **Power modifier:** with a senior counterpart, curiosity or evidence may precede the
  disagreement in either market; the presence of hierarchy is more important than the
  passport of the room.

---

## 4.9 Contrast rule: acknowledgment before disagreement

```yaml
id: reg_ack_before_disagree
type: cultural_rule
contexts: [disagreement, criticism_fair, criticism_unfair, aggression,
           giving_negative_feedback]
priority: high
```

Acknowledgment is not agreement.

- **Canada baseline:** a concise, specific acknowledgment is more often useful before a
  counter-position, especially where the relationship continues after the exchange.
- **USA baseline:** acknowledgment remains useful, but in fast decision or negotiation
  settings it should normally be brief enough that it does not obscure the position.
- **Both:** generic formulas such as "I hear you" receive no automatic credit. The
  acknowledgment must refer to something actually said or experienced.

---

## 4.10 Contrast rule: requests

```yaml
id: reg_request
type: cultural_rule
contexts: [difficult_request, negotiation]
priority: high
```

- **USA:** direct request + reason/benefit is a strong default: "I need the revised numbers
  by 2 PM so I can send the client version today."
- **Canada:** direct request is also normal; a brief courtesy frame or room for response
  may improve reception: "Could you send the revised numbers by 2 PM? That lets me get
  the client version out today."
- **Both:** the requested action, owner and timing must be recoverable where the situation
  requires them.

The evaluator never penalises "could" merely for being softer than "I need"; it checks
whether the request is actionable and appropriately calibrated to relationship and power.

---

## 4.11 Contrast rule: refusal and boundary

```yaml
id: reg_refusal
type: cultural_rule
contexts: [difficult_request, boundary_violation, negotiation]
priority: high
```

- **USA:** a clean refusal can be sufficient: "I can't take that on this week."
- **Canada:** constraint + alternative is often a strong relational form: "I won't get to
  that this week. I can take it Monday, or we can move X."
- **Both:** the real measure is whether the boundary survives the next reasonable push.
- **Both:** an alternative is optional when offering one would undermine the boundary or
  create responsibility the user does not want.

---

## 4.12 Contrast rule: self-advocacy and claiming credit

```yaml
id: reg_credit
type: cultural_rule
contexts: [self_advocacy, receiving_positive_feedback]
priority: high
```

- **USA baseline:** first-person ownership attached to impact is normally expected and
  efficient: "I redesigned the QA flow; it reduced regression time by 30%."
- **Canada baseline:** first-person ownership remains valid; team context can be added
  without erasing the contribution: "The team improved regression time by 30%; I led the
  QA redesign that drove most of that change."
- **Both:** deflecting all credit to the team when the user's contribution is material is
  not cultural humility if it makes the contribution invisible.
- **Both:** claiming work the user did not do is a red line.

---

## 4.13 Contrast rule: apology

```yaml
id: reg_apology
type: cultural_rule
contexts: [criticism_fair, criticism_unfair, upset_person, boundary_violation]
priority: high
signals: [apology_type, apology_count]
```

Apology forms are classified by function before they are evaluated:

- `ritual` - politeness / social lubricant, no fault accepted;
- `responsibility` - ownership of a named fault;
- `false_responsibility` - ownership of something not established as the user's;
- `pseudo` - apology-shaped dismissal, e.g. "Sorry you feel that way."

- **Canada:** ritual apology at ordinary frequency is neutral-to-positive and must not be
  treated as low status or guilt.
- **USA:** ritual apology is also ordinary, but high-density apologetic framing can create
  unnecessary fault-taking in some professional contexts.
- **Both:** responsibility apology is positive when responsibility is real; false
  responsibility is negative regardless of market; pseudo-apology does not count as
  acknowledgment.

---

## 4.14 Contrast rule: small talk and relational opening

```yaml
id: reg_small_talk
type: cultural_rule
contexts: [meeting_open, difficult_request, negotiation, self_advocacy]
priority: medium
```

- **USA:** brief friendliness is functional; a long preamble before a known agenda can be
  inefficient in time-bounded professional settings.
- **Canada:** matching a counterpart's relational opening can be particularly useful when
  trust is still being built; skipping it entirely may read as transactional in some
  settings.
- **Both:** small talk is not mandatory. The strongest observable rule is **matching**:
  whether the user roughly matches the counterpart's opening rather than forcing a style.

---

## 4.15 Contrast rule: feedback - giving it

```yaml
id: reg_giving_feedback
type: cultural_rule
contexts: [giving_negative_feedback]
priority: high
```

- **USA:** issue -> evidence -> impact -> next step is often efficient, with the main point
  relatively early.
- **Canada:** the same sequence is effective; a brief relational frame or acknowledgment
  may reduce unnecessary defensiveness where the relationship is ongoing.
- **Both:** feedback must identify behaviour or output, not identity; examples must be
  specific; expectations must become actionable.

Country never justifies vague feedback.

---

## 4.16 Contrast rule: receiving criticism

```yaml
id: reg_receiving_feedback
type: cultural_rule
contexts: [criticism_fair, criticism_unfair]
priority: high
```

- **USA:** concise ownership or concise disagreement after clarification is normally
  sufficient; extended preambles can look like avoidance.
- **Canada:** concise acknowledgment before ownership or disagreement is often helpful,
  particularly where the relationship continues.
- **Both:** clarify what is being raised before defending against a vague criticism; accept
  valid responsibility and no more than valid responsibility.

---

## 4.17 Contrast rule: silence and response pause

```yaml
id: reg_pause
type: cultural_rule
contexts: [aggression, criticism_unfair, criticism_fair, negotiation, upset_person]
priority: high
signals: [response_latency, intra_response_pause]
```

No fixed millisecond threshold separates confidence from hesitation in either market.

- **Fast U.S. professional exchange:** an extended **unmarked** silence may create
  ambiguity about whether the user has an answer or is still holding the floor. A brief
  bridge such as "Give me a second - I want to answer that accurately" can make the
  thinking explicit.
- **Canadian professional exchange:** reflective silence may be somewhat better tolerated,
  especially after criticism or emotionally loaded information, but the meaning still
  depends on what follows.
- **Both - empathic exception:** after painful personal disclosure, silence may itself be
  acknowledgment. Filling it with process language can reduce empathy.

The evaluator assesses **function**, not duration alone.

---

## 4.18 Contrast rule: interruption and floor management

```yaml
id: reg_interruption
type: cultural_rule
contexts: [disagreement, negotiation, aggression, meeting_open]
priority: medium
signals: [interruptions, floor_share]
```

- **USA:** collaborative overlap can be normal in fast teams; mid-point cut-off that
  prevents substantive information from landing remains a problem.
- **Canada:** repeated cut-off is more likely to create relational cost in many settings,
  but ordinary overlap is not automatically rude.
- **Both:** location and function of the overlap matter more than raw count. Reclaiming the
  floor after repeated interruption is distinct from interrupting to prevent the other
  person speaking.

---

## 4.19 Contrast rule: open questions

```yaml
id: reg_questions
type: cultural_rule
contexts: [criticism_fair, criticism_unfair, disagreement, indirect_signal,
           soft_no, negotiation, upset_person]
priority: high
```

- **USA:** questions are efficient when pointed and information-seeking; a long chain of
  questions without a position can look like stalling.
- **Canada:** questions can carry disagreement or surface a soft no without forcing the
  counterpart into a public confrontation.
- **Both:** one answerable question is usually more effective than a stack. A question is
  not credited as assertiveness if the user's needed position never arrives.

---

## 4.20 Contrast rule: empathy and emotional acknowledgment

```yaml
id: reg_empathy
type: cultural_rule
contexts: [upset_person, criticism_fair, aggression, relationship_repair]
priority: high
```

The principle is universal: demonstrate that the other person's relevant experience has
been received before moving past it when the situation calls for that.

- **USA:** concise, specific acknowledgment is normally sufficient in professional
  settings; do not turn empathy into a long preamble that displaces action.
- **Canada:** somewhat more relational framing may be useful in many professional and
  personal settings, but generic warmth without substance receives no credit.
- **Both:** empathy is not agreement, surrender, diagnosis, or responsibility-taking.

---

## 4.21 Contrast rule: meeting participation

```yaml
id: reg_meeting_participation
type: cultural_rule
contexts: [meeting_open, disagreement, self_advocacy]
priority: medium
```

- **USA:** visible contribution and explicit ownership are often expected; waiting for a
  formal invitation to speak can make expertise invisible.
- **Canada:** visible contribution also matters; turn entry may be more relationally
  calibrated in some rooms, particularly with hierarchy or established meeting norms.
- **Both:** the evaluator looks at whether the user entered when they had relevant value,
  whether the point landed, and whether they could reclaim the floor if interrupted.

---

## 4.22 Contrast rule: negotiation

```yaml
id: reg_negotiation
type: cultural_rule
contexts: [negotiation]
priority: high
```

- **USA:** explicit position, interests, alternatives and decision criteria are strong
  default forms. Silence may be used strategically but should not be interpreted from
  duration alone.
- **Canada:** the same substantive clarity is required; maintaining cooperative tone and
  avoiding unnecessary relational threat may carry somewhat more weight in some settings.
- **Both:** unprompted concession during silence is a high-value finding; politeness is not
  a concession; a question is not a concession; changing position because of new evidence
  is not loss of assertiveness.

---

## 4.23 Contrast rule: closing and commitments

```yaml
id: reg_closing
type: cultural_rule
contexts: [criticism_fair, difficult_request, negotiation, giving_negative_feedback,
           boundary_violation]
priority: high
```

Country differences are small here. Effective closing normally makes the next step
explicit where a next step is part of the objective:

- who does what;
- by when;
- what remains unresolved;
- whether the counterpart accepted or rejected the commitment.

A warm close may be more or less elaborate by market and relationship, but warmth does
not substitute for an actionable commitment.

---

## 4.24 Professional vs personal domain

```yaml
id: reg_domain
type: interpretation_rule
priority: high
```

Country calibration has **more weight** in professional, networking and public settings,
where shared institutional norms matter. It has **less weight** in established personal
relationships, where relationship history, family norms, familiarity, and the counterpart's
individual style normally dominate.

For `domain: personal`, country remains available as a weak baseline only where this Manual
names a relevant contrast. It never creates a score deduction by itself. The evaluator therefore
never carries a workplace rule mechanically into an intimate conversation. Examples:

- BLUF is often useful in an executive update; it is not a default standard for responding
  to a partner's painful disclosure.
- A short acknowledgment may be enough in a U.S. status meeting; a close relationship may
  require more reception before problem-solving in either country.
- A boundary must be clear in both domains, but a personal boundary need not sound like a
  business memo.

---

## 4.25 Country from the user profile

```yaml
id: reg_profile_market
type: interpretation_rule
priority: high
```

The user's profile stores a default market:

```yaml
default_evaluation_market: canada | usa
```

Every practice inherits it unless the user or scenario overrides it. The UI should make
that override easy because location and communication environment are not always the
same: a person living in Vancouver may work on a U.S. team, and a U.S.-based user may be
preparing for a Canadian client.

**Do not label the user:** no "Canadian communicator", "American style", or inferred
national identity. The field describes the environment the user wants to train for.

---

## 4.26 User register gap

```yaml
id: reg_gap
type: interpretation_rule
priority: high
related: [dir_07]
```

Two variables remain separate:

- **room register** - what this scenario and counterpart reward;
- **user_register** - the form the user repeatedly produces across comparable sessions.

Country is not `user_register`.

Where the user's habitual form differs from the room, report the gap as a **form-setting
mismatch**, not a trait. Example:

> "Your point arrived after three layers of softening. In this U.S. scenario the manager
> had already moved the meeting on before the position landed."

Where the user intentionally practises a different market from their default, the gap is
the training target, not a deficiency.
# 5. User Direction and Calibration

## 5.1 The variable

```yaml
id: dir_01
type: principle
priority: high
```

```yaml
user_direction: under_assertive | over_assertive | mixed | unknown
source: onboarding_self_report | rolling_evidence | user_declared
confidence: high | medium | low
scope: global | per_context      # see dir_07
```

The target audience contains two opposite failure directions. Treating them
symmetrically produces feedback that is wrong for both.

- **Under-assertive.** The position is not stated, is stated once and dropped,
  or is withdrawn under mild pressure. Needs are traded for peace. Credit is
  deflected.
- **Over-assertive.** The position is stated before the other person's concern
  is understood. Disagreement arrives without acknowledgment. Correctness is
  pursued past the point where it serves the objective.

## 5.2 How direction is set

```yaml
id: dir_02
type: interpretation_rule
priority: high
```

1. **Self-report.** Six items on a five-point scale, producing a provisional
   direction at `low` confidence.

   **Timing: presented after the user's first completed practice, never at
   sign-up.** Before the first practice the items read as an examination to an
   audience whose stated fear is being judged incompetent, and they cost
   completion. After one practice, the same items read as configuring a tool
   that has already produced something. The user may skip them; `dir_06` then
   governs until rolling evidence accumulates.

   Items:

   - When I disagree with someone more senior, I usually say so in the moment.
   - When someone criticises my work, my first reaction is to explain myself.
   - I agree to requests I don't have capacity for.
   - When I'm praised for something I did, I redirect the credit to others.
   - I say what I think before I've fully heard the other person out.
   - After a difficult conversation, I think of what I should have said.

   **Personal-domain items.** Workplace behaviour does not reliably predict behaviour with a
   partner, friend, or family member. These six items produce a separate personal-domain prior:

   - When something a family member or partner does upsets me, I usually raise it before I am already angry.
   - I agree to personal or family plans I do not want in order to avoid friction.
   - In an argument at home, I sometimes say a sharper version of what I mean than I would elsewhere.
   - I let the same issue bother me repeatedly rather than raise it again.
   - When someone close is upset with me, my first move is often to explain my side.
   - After a difficult personal conversation, I often think of what I wanted to say only later.

   These answers are optional, produce `low` confidence only, and are never displayed as a
   personality type. Where workplace and personal patterns diverge, `user_direction` is stored
   `per_context` (`dir_07`).

2. **Rolling evidence.** Updated across sessions. A direction may move to
   `medium` confidence after **three comparable sessions** showing the same
   pattern, and to `high` only after five, with no more than one contrary
   session.

3. **User-declared.** The user may set or correct their own direction at any
   time. A user-declared direction overrides an inferred one and is recorded at
   `medium` confidence.

**Never** set direction from a single practice session. A single session
reflects the scenario at least as much as the user.

## 5.3 Asymmetric evaluation

```yaml
id: dir_03
type: interpretation_rule
priority: high
related: [ev_08]
```

Interpretation is identical for both directions. Evaluation is not.

| Observed behaviour | Under-assertive user | Over-assertive user |
|---|---|---|
| Unhedged boundary, slightly sharp | Credit as a win. Do not flag tone unless it crossed into personal attack (`dir_05`). | Check whether acknowledgment preceded it. If not, that is the note. |
| Extended acknowledgment before disagreeing | Check the disagreement actually arrived. Acknowledgment without a position is avoidance in a new costume. | Credit as a win. |
| Position restated after pushback | Credit strongly — this is the target behaviour. | Check whether anything new was heard between the two statements. |
| Long response-start pause | Neutral; evaluate by what followed. Do not infer planning from duration. | Credit if it replaced an interruption, while still evaluating what followed. |
| Credit deflected to the team after praise | Name it. This is the highest-value single finding for this direction. | Usually not present; if present, treat as ordinary modesty, not a finding. |
| Question asked instead of stating a position | Check whether the position arrives later. If never, that is the finding. | Credit as a win. |
| Interruption of the counterpart | Rare; if present, do not flag on a first occurrence. | Flag, with the specific turn quoted. |

## 5.4 One direction per report

```yaml
id: dir_04
type: feedback_rule
priority: high
```

**A single report never contains both "be clearer or more direct" and "soften
your delivery."**

This constraint is absolute. The two together form a double bind that no user
can act on, and for this audience — whose stated fear is being seen as *both*
incompetent *and* "too much" — it confirms exactly the belief that brought them
to the product.

Where the evidence genuinely supports both, the report addresses the one that
carries more weight for the objective in this situation, and says nothing about
the other. The suppressed observation may be raised in a later session on a
different scenario.

## 5.5 The limit of the asymmetry

```yaml
id: dir_05
type: interpretation_rule
priority: high
related: [dir_03]
```

Direction adjusts how a behaviour is weighted. It never suspends a rule.

Regardless of direction, the following are noted whenever observed:

- personal attack, contempt, or characterisation of the other person rather
  than the problem;
- accepting responsibility for something the user did not do;
- commitment to something the user has no means of meeting;
- an objective red line declared in the scenario (Scenario Objective and
  Outcome, §8).

An under-assertive user finally pushing back is credited for pushing back and
still told, separately and without softening the credit, if the push crossed
into an attack on the person.

## 5.6 When direction is unknown

```yaml
id: dir_06
type: feedback_rule
priority: high
related: [dir_02]
```

`user_direction: unknown` is a normal, valid operational state, not a
degraded one — Manual-driven objective/context evaluation is fully available
before any inferred or user-declared direction exists (`dir_02` requires at
least three comparable sessions before even `medium` confidence is reached,
so `unknown` is the expected starting state for every user).

With `user_direction: unknown`, feedback is restricted to:

- what happened, quoted;
- whether it served the situation's objective;
- situation-specific alternatives.

**Explicitly allowed** while direction is unknown: everything above —
objective/context evaluation, `effectiveness`, red-line checking, and every
other dimension not itself gated on direction — proceeds normally.
User-direction inference is a calibration input for *style* feedback only; it
is not a prerequisite for evaluation as a whole.

**Excluded** while direction is unknown: any advice about delivery style,
assertiveness calibration, or how much to soften or sharpen. Style advice
without a baseline is as likely to be harmful as helpful.

Direction must never be inferred from the current single session regardless
of how strong that one session's evidence looks — `dir_02`'s three-session
minimum for even `medium` confidence applies without exception.

## 5.7 Mixed direction

```yaml
id: dir_07
type: interpretation_rule
priority: medium
```

Direction is frequently context-dependent, and the most common pattern in this
audience is assertive at work and avoidant at home — or the reverse.

Where evidence supports different directions in different contexts, the
variable is stored `per_context` rather than `global`, and evaluation uses the
direction for the current `context_type`. Where a context has no direction
evidence, `dir_06` applies for that context — not the user's direction from
elsewhere.

## 5.8 Direction is never shown as a label

```yaml
id: dir_08
type: feedback_rule
priority: high
related: [safety_03]
```

`user_direction` is an internal calibration variable. It is never displayed to
the user as an identity, a type, or a trait — no "you are conflict-avoidant",
no profile badge, no type name.

It surfaces only as behaviour and as progress against the user's own history:
"the position was stated once and then dropped under pushback — in the last two
practices it was restated, which is what held the conversation."

## 5.9 Progress is baseline-relative

```yaml
id: dir_09
type: feedback_rule
priority: high
```

Progress is measured against the user's own prior comparable attempts, never
against a population midpoint and never against an ideal response. An
under-assertive user moving from no position to a stated-then-withdrawn
position has made real progress and the report says so, even though the
absolute outcome was still a withdrawal.

---
# 6. Conversation Context Taxonomy

## 6.0 How contexts are used

```yaml
id: ctx_00
type: principle
priority: high
```

A context is a type of communication problem, not a topic. Two scenarios about the same
missed deadline belong to different contexts if one contains fair criticism and the
other contains a false accusation, because the useful sequence changes.

Every scored scenario declares exactly one primary `context_type`, one
`evaluation_market`, one `domain`, and one `register`. A scenario may carry secondary
context tags for retrieval, but scoring follows the primary context.

Core cross-domain context set:

```yaml
contexts:
  - criticism_fair
  - criticism_unfair
  - aggression
  - boundary_violation
  - indirect_signal
  - soft_no
  - disagreement
  - giving_negative_feedback
  - difficult_request
  - self_advocacy
  - receiving_positive_feedback
  - upset_person
  - meeting_open
  - negotiation
  - relationship_repair
```

`accusation` remains a subtype of `criticism_unfair` unless production evidence shows a
different sequence is required. Personal-domain contexts with distinct relational mechanics are
specified separately in §17 and are equally first-class retrieval targets for `domain: personal`.

---

## 6.1 Context: Receiving fair criticism

```yaml
id: ctx_criticism_fair
type: context
context_id: criticism_fair
domain: mixed  # occurs identically in workplace and personal relationships; v2.1 never restricted it to one
objective_type: scenario_specific  # workplace instances are typically instrumental (a correction/next step); personal instances can lean relational — the scenario declares which
priority: high
tools: [response_pause, acknowledgment, open_questions, fair_responsibility]
```

**Definition.** The counterpart raises a concern about the user's work or behaviour, and
the concern has a real basis, whether or not it is framed well.

**Primary objectives.** Understand what specifically is being raised; separate substance
from delivery; acknowledge what is valid; take responsibility where it belongs and only
there; leave with a correction or next step where the situation requires one.

**Common risks.** Defending before understanding; agreeing to everything to end the
discomfort; over-apologising instead of making a plan; dismissing valid content because
the delivery was unpleasant.

**Country calibration.** Canada may reward a brief acknowledgment before ownership more
often; U.S. professional settings may reward faster ownership. Neither market rewards
excuses before understanding.

**Reclassification.** If clarification shows the concern has no basis, switch to
`criticism_unfair`; establishing that is part of the skill, not wasted time.

---

## 6.2 Context: Receiving unfair criticism / accusation

```yaml
id: ctx_criticism_unfair
type: context
context_id: criticism_unfair
domain: mixed  # false accusations occur in both domains; the useful sequence does not change
objective_type: mixed  # correcting the premise (instrumental) and preserving a usable relationship (relational) are both named in this context's own primary objectives
priority: high
tools: [response_pause, acknowledgment, open_questions, false_premise_correction]
```

**Definition.** The counterpart attributes a failure, intention, pattern or responsibility
to the user that is inaccurate or unsupported.

**Primary objectives.** Establish what is being alleged; separate emotion from premise;
acknowledge concern without conceding a false claim; correct the facts; preserve a usable
relationship where that matters.

**Common risks.** Immediate denial before the allegation is clear; counterattack; accepting
partial fault only to reduce tension; over-explaining; treating acknowledgment as admission.

**Country calibration.** In many Canadian settings, acknowledgment before correction can
reduce relational threat. In many U.S. settings, the correction can arrive earlier. In
both, the false premise must eventually be corrected explicitly.

---

## 6.3 Context: Aggression

```yaml
id: ctx_aggression
type: context
context_id: aggression
domain: mixed  # hostility is not workplace-specific; the regulate/de-escalate/boundary sequence is identical in personal settings
objective_type: instrumental  # regulating the exchange and establishing/holding a boundary are observable, external results in either domain
priority: high
tools: [response_pause, labeling, boundary_statement, open_questions]
```

**Definition.** The counterpart uses hostile, contemptuous, intimidating or personally
attacking language. The marker is semantic target and function, not loudness alone.

**Primary objectives, in order.** Regulate immediate reaction; avoid escalation; preserve
self-respect; determine whether productive conversation remains possible; establish or
repeat a boundary where it does not.

**Common risks.** Matching the attack; capitulating to end it; reasoning with content while
ignoring the attack; remaining in a conversation that no longer has productive conditions.

**Country note.** Cold hostility, clipped courtesy and social exclusion can be aggressive
without volume. Conversely, ordinary bluntness is not aggression merely because it feels
more U.S.-direct than the user's baseline.

---

## 6.4 Context: Boundary violation

```yaml
id: ctx_boundary_violation
type: context
context_id: boundary_violation
domain: mixed  # remains the general/shared boundary context; ctx_family_obligation and ctx_parent_child_limit are its personal specializations, not replacements
objective_type: instrumental  # stating and holding a limit is an observable, external result regardless of domain
priority: high
tools: [boundary_statement, response_pause, graceful_repetition]
```

**Definition.** A request, demand, behaviour or conversational move crosses a limit the
user is entitled to set in this scenario.

**Primary objectives.** State the limit; make the available alternative clear where one
exists; survive a reasonable repeat ask without abandoning the limit; end or escalate the
conversation where the boundary is not respected.

**Common risks.** Excessive justification; apologising for the existence of the boundary;
turning a boundary into an attack; offering an alternative that recreates the same burden.

**Country calibration.** Canadian form may more often use constraint + alternative; U.S.
form may more often use a clean refusal. Success is the same: the limit is clear and
survives pressure.

---

## 6.5 Context: Indirect signal

```yaml
id: ctx_indirect_signal
type: context
context_id: indirect_signal
domain: mixed  # indirectness is a communication style, not a workplace-specific phenomenon
objective_type: instrumental  # surfacing the operative issue is an observable, external result regardless of domain
priority: high
tools: [open_questions, labeling, mirroring]
```

**Definition.** The counterpart communicates a concern, resistance or decision through
implication, euphemism, changed formality, or an oblique phrase rather than an explicit
statement.

**Primary objectives.** Notice the signal; test its meaning without claiming certainty;
surface the operative issue; respond to what is actually confirmed.

**Common risks.** Ignoring the signal; mind-reading; treating one ambiguous phrase as a
fact; becoming so careful that nothing is surfaced.

**Country calibration.** This context is useful in both markets. It is expected to occur
somewhat more often in Canadian relationship-sensitive scenarios, but the scenario must
contain the signal explicitly; the evaluator never invents one because the market is Canada.

---

## 6.6 Context: Soft no

```yaml
id: ctx_soft_no
type: context
context_id: soft_no
domain: mixed  # indirect resistance to a plan or ask occurs in personal and professional relationships alike
objective_type: instrumental  # distinguishing delay from refusal is an observable, external result regardless of domain
priority: high
tools: [open_questions, labeling]
```

**Definition.** The counterpart does not state "no" directly but repeatedly signals low
priority, unavailable bandwidth, indefinite delay, or unwillingness to proceed.

**Primary objectives.** Distinguish delay from refusal; give the counterpart a safe route
to state the answer; stop selling into an answer that is already functionally no.

**Useful question.** "Would it help if I came back in two weeks, or is this not a direction
you want to pursue?"

**Country calibration.** The form is especially relevant in Canadian professional
scenarios, but it is never presumed from country alone.

---

## 6.7 Context: Disagreement

```yaml
id: ctx_disagreement
type: context
context_id: disagreement
domain: mixed  # disagreement occurs identically in workplace and personal relationships
objective_type: scenario_specific  # workplace disagreement typically instrumental (clarify positions/decide next step); personal disagreement can lean relational — the scenario declares which
priority: high
tools: [acknowledgment, fact_vs_story, open_questions, problem_not_person]
```

**Definition.** The parties hold materially different positions without the interaction
necessarily being criticism or aggression.

**Primary objectives.** Make the disagreement clear; understand the other side's reasons;
identify facts, assumptions and interests; preserve the ability to continue working or
relating; decide what remains unresolved.

**Common risks.** Treating disagreement as disrespect; arguing against a position never
actually stated; questioning indefinitely instead of stating a view; pursuing correctness
past the point of usefulness.

---

## 6.8 Context: Giving negative feedback

```yaml
id: ctx_giving_negative_feedback
type: context
context_id: giving_negative_feedback
domain: workplace  # definition is framed around behaviour/output/performance; a personal equivalent is better served by raising_personal_issue or recurring_conflict, which have their own dedicated mechanics
objective_type: instrumental
priority: high
tools: [fact_vs_story, acknowledgment, open_questions, problem_not_person]
```

**Definition.** The user needs to raise a problem in another person's behaviour, output,
impact or performance.

**Primary objectives.** State the issue in observable terms; explain relevant impact;
allow response; distinguish intent from effect; agree on a next step where appropriate.

**Common risks.** Identity labels; mind-reading; stacking historical grievances; vague
"you need to communicate better" feedback; softening so far that the issue disappears.

**Country calibration.** U.S. scenarios may place the issue earlier. Canadian scenarios
may use a brief relational bridge. Specificity is universal.

---

## 6.9 Context: Difficult request

```yaml
id: ctx_difficult_request
type: context
context_id: difficult_request
domain: workplace  # personal equivalents are served by the dedicated ctx_asking_for_support / ctx_family_obligation contexts
objective_type: instrumental
priority: high
tools: [clear_request, open_questions, boundary_statement]
```

**Definition.** The user needs something that may impose cost, inconvenience, risk or
change on the counterpart.

**Primary objectives.** Make the ask actionable; state why it matters; leave room for a
real answer; negotiate constraints without converting the ask into a hint.

**Common risks.** Long preamble; apology replacing the ask; no deadline or owner; coercive
framing; treating a refusal as betrayal.

---

## 6.10 Context: Self-advocacy

```yaml
id: ctx_self_advocacy
type: context
context_id: self_advocacy
domain: workplace  # framed around career/contribution/credit visibility
objective_type: instrumental
priority: high
tools: [impact_self_advocacy, clear_request, fact_vs_story]
```

**Definition.** The user needs to make their contribution, value, readiness, need or career
interest visible.

**Primary objectives.** State ownership accurately; connect work to impact; make the
relevant ask or ambition explicit; preserve credibility and team context where relevant.

**Common risks.** Waiting to be noticed; activity list without impact; team-only framing
that erases ownership; inflated claims; apologising for ambition.

**Country calibration.** U.S. scenarios may reward more visible first-person ownership.
Canadian scenarios can include team context, but the user's contribution still has to be
recoverable.

---

## 6.11 Context: Receiving positive feedback / praise

```yaml
id: ctx_receiving_positive_feedback
type: context
context_id: receiving_positive_feedback
domain: workplace  # framed around professional recognition/credit; ex_013's own example is a workplace credit-deflection case
objective_type: instrumental
priority: medium
tools: [impact_self_advocacy]
```

**Definition.** The counterpart recognises the user's contribution, and the user has an
opportunity to receive credit accurately.

**Primary objectives.** Accept the recognition; do not reflexively erase ownership; add
useful context if appropriate; avoid exaggeration.

**Common risks.** "It was nothing"; immediate credit deflection; turning praise into a
long self-promotion monologue.

---

## 6.12 Context: Upset person

```yaml
id: ctx_upset_person
type: context
context_id: upset_person
domain: mixed  # a distressed counterpart occurs identically in workplace and personal relationships
objective_type: mixed  # receiving the person (relational) and moving to problem-solving only when ready (instrumental) are both named in this context's own primary objectives
priority: high
tools: [response_pause, acknowledgment, labeling, open_questions]
```

**Definition.** The counterpart is hurt, disappointed, worried or distressed and wants to
be heard or understood; the core issue is not necessarily accusation.

**Primary objectives.** Receive before solving; establish what matters; avoid premature
advice; take responsibility where appropriate; move to problem-solving only when the
conversation is ready for it.

**Common risks.** Explaining too early; "at least" reframing; fixing before understanding;
labelling an emotion as fact; using empathy phrases as a script.

**Country note.** Country weighting is weaker here than relationship and emotional stakes.

---

## 6.13 Context: Meeting opening / entering the room

```yaml
id: ctx_meeting_open
type: context
context_id: meeting_open
domain: workplace  # inherently organizational (group work, agendas)
objective_type: instrumental
priority: medium
tools: [small_talk_match, graceful_floor_reclamation, impact_self_advocacy]
```

**Definition.** The user is establishing presence, rapport and participation before or at
the start of substantive group work.

**Primary objectives.** Match the room; enter without unnecessary friction; contribute
when value is available; avoid remaining invisible by waiting for perfect invitation.

**Common risks.** Skipping all relational opening where the counterpart clearly offers it;
long small talk after the agenda is active; never entering the discussion; competing for
the floor at every transition.

---

## 6.14 Context: Negotiation

```yaml
id: ctx_negotiation
type: context
context_id: negotiation
domain: workplace  # personal negotiation-shaped situations are served by ctx_different_needs / ctx_unequal_investment instead
objective_type: instrumental
priority: high
tools: [open_questions, boundary_statement, clear_request, response_pause,
        fact_vs_story]
```

**Definition.** The parties are allocating terms, resources, timing, scope or commitments
and have partly aligned and partly competing interests.

**Primary objectives.** Make interests and positions explicit; discover the other side's
constraints; avoid unprompted concession; make trades rather than unilateral give-aways;
close with clear terms.

**Common risks.** Negotiating against oneself; filling silence with concessions; confusing
politeness with agreement; defending a position without discovering interests.

---

## 6.15 Context: Relationship repair

```yaml
id: ctx_relationship_repair
type: context
context_id: relationship_repair
domain: mixed  # remains the general/shared repair context; repair_after_rupture (§17) is its dedicated personal specialization, not a replacement
objective_type: relational  # "repair rather than winning the original point" is the primary lens regardless of domain
priority: high
tools: [acknowledgment, fair_responsibility, repair_reset, open_questions]
```

**Definition.** A prior interaction caused rupture, misunderstanding, hurt or loss of
trust, and the current objective is repair rather than winning the original point.

**Primary objectives.** Name what happened in observable terms; understand impact; own the
user's part accurately; correct misunderstandings without cancelling responsibility;
identify what would make the relationship usable again.

**Common risks.** "I'm sorry if" formulations; reopening every fact of the original
argument; demanding forgiveness; over-owning the other person's part; treating repair as
proof that the user was wrong about the original issue.
# 7. Communication Skills and Tools

## 7.0 No tool is mandatory

```yaml
id: tool_00
type: principle
priority: high
```

Tools are means, not ends. A user who reaches the scenario objective by another ethical,
clear and non-escalating route has succeeded. The report never says the user "should have
used" a technique merely because it exists in the Manual.

Every tool below uses the same logic: purpose -> mechanism -> when to use -> when not to
use -> observable evidence -> positive/negative signals -> cultural calibration ->
exceptions -> examples.

---

## 7.1 Tool: Pause Before Responding

```yaml
id: tool_response_pause
type: tool
tool_id: response_pause
contexts: [aggression, criticism_unfair, criticism_fair, boundary_violation,
           negotiation, upset_person]
signals: [response_latency, intra_response_pause, filler_candidates]
priority: high
```

### Purpose
Create space between stimulus and response so the next move is chosen rather than purely
reactive.

### Good Form
One pause at a decision point, followed by a coherent response. Where unmarked silence
could create ambiguity about floor ownership, a brief bridge may name the pause.

### Weak / Risky Form
Repeated pauses inside abandoned clauses; pause followed by the same retaliation; silence
used to punish; a bridge so long that it becomes a defensive preamble.

### Observable Evidence
Response latency; what immediately follows; clause completion; presence of a verbal bridge;
interruption pattern; whether the user's position remains intact.

### Cultural Calibration
Use `reg_pause`. No fixed duration is positive or negative. U.S. fast professional rooms
may benefit from a verbal marker sooner; Canadian or empathic contexts may tolerate or
value unmarked reflection more. Context and following response decide.

### Ceiling
A pause at the relevant decision point - marked where useful - followed by a complete
response that serves the objective without retaliation or unnecessary concession.

---

## 7.2 Tool: Acknowledgment

```yaml
id: tool_acknowledgment
type: tool
tool_id: acknowledgment
contexts: [criticism_fair, criticism_unfair, aggression, boundary_violation,
           disagreement, upset_person, relationship_repair, giving_negative_feedback]
priority: high
```

### Purpose
Demonstrate that the counterpart's relevant point or experience has been received before
moving past it.

### Core Mechanism
Acknowledgment reduces the need for repetition. It does not require agreement.

### Good Form
Specific, brief enough for the context, and followed by substance. It names something the
counterpart actually said or experienced.

### Weak / Risky Form
Generic "I hear you" with no reference; acknowledgment that concedes a false premise;
multiple acknowledgments used to postpone a position; empathy language that is immediately
cancelled by the next sentence.

### Cultural Calibration
Canada often rewards a brief acknowledgment before disagreement or bad news; U.S. fast
professional settings may require it to be shorter. In personal upset, relationship and
stakes matter more than country.

### Ceiling
At least one specific acknowledgment that does not concede a disputed premise and is
followed by the user's relevant position, question, responsibility or next step.

---

## 7.3 Tool: Labeling / Tentative Perception Check

```yaml
id: tool_labeling
type: tool
tool_id: labeling
contexts: [aggression, criticism_unfair, indirect_signal, soft_no, upset_person]
priority: high
```

### Purpose
Surface a concern, tension or possible meaning without claiming access to another person's
internal state.

### Good Form
Tentative and checkable: "It sounds like the timeline is the part you're least comfortable
with - is that right?"

### Weak / Risky Form
Diagnosis: "You're angry because..."; certainty about motive; patronising emotional labels;
using a label instead of responding to an explicit request.

### Observable Evidence
Tentative stem; target of label; confirmation question or pause; counterpart confirmation,
correction or added information.

### Cultural Calibration
Useful in both markets. It can be especially valuable where resistance is mitigated rather
than explicit, but country never licenses mind-reading.

### Ceiling
One tentative perception check that produces confirmation, correction or new information
and is then used in the conversation.

---

## 7.4 Tool: Open Questions

```yaml
id: tool_open_questions
type: tool
tool_id: open_questions
contexts: [criticism_fair, criticism_unfair, indirect_signal, soft_no, disagreement,
           negotiation, upset_person, relationship_repair]
priority: high
```

### Purpose
Obtain information the user does not yet have, especially before responding to a premise
or solving a problem.

### Good Form
One open, answerable question. Prefer `what`, `how`, `which part`, or a neutral equivalent
when the exchange is charged. Follow with listening.

### Weak / Risky Form
Question stacks; rhetorical questions; questions used indefinitely instead of stating a
position; `why` phrased as accusation rather than inquiry.

### Cultural Calibration
U.S. settings often reward fewer, pointed questions. Canadian mitigated settings may use
questions to carry disagreement or surface a soft no. In both, questions are means; if a
position is required and never arrives, questioning alone is not success.

### Ceiling
A question produces information the user did not have, and the user uses that information
to move the objective.

---

## 7.5 Tool: Fact vs Story

```yaml
id: tool_fact_vs_story
type: tool
tool_id: fact_vs_story
contexts: [disagreement, criticism_unfair, giving_negative_feedback, negotiation,
           relationship_repair]
priority: high
```

### Purpose
Separate observable events from interpretation, motive, prediction and identity labels.

### Good Form
"The report was sent after the agreed deadline" rather than "You don't respect my time."

### Weak / Risky Form
Using "fact" to smuggle in an interpretation: "The fact is you were careless." Treating an
emotion or assumption as evidence.

### Observable Evidence
Whether the statement can be verified from actions, dates, words or outputs; presence of
motive attribution; universal terms such as always/never when unsupported.

### Cultural Calibration
Universal. Country changes framing, not the fact/story distinction.

### Ceiling
The user states the relevant observable fact, distinguishes interpretation where needed,
and builds the next move on the fact rather than a character judgment.

---

## 7.6 Tool: Clear Boundary Statement

```yaml
id: tool_boundary_statement
type: tool
tool_id: boundary_statement
contexts: [boundary_violation, aggression, difficult_request, negotiation]
priority: high
```

### Purpose
State what the user will or will not do, accept, continue or discuss.

### Good Form
Limit + available next step where useful: "I can discuss the missed deadline. I won't
continue while I'm being called incompetent."

### Weak / Risky Form
Threat disguised as boundary; lecture; over-justification; asking permission for a limit
the user has already decided.

### Cultural Calibration
U.S. form may be shorter; Canadian form may more often include constraint/alternative.
Success in both requires the limit to remain clear under repeat pressure.

### Ceiling
The boundary is explicit, non-attacking, behaviourally controllable by the user, and
survives at least one reasonable challenge where the scenario includes one.

---

## 7.7 Tool: Accept Fair Responsibility

```yaml
id: tool_fair_responsibility
type: tool
tool_id: fair_responsibility
contexts: [criticism_fair, relationship_repair, upset_person]
priority: high
```

### Purpose
Own the part that is genuinely the user's without defensiveness and without absorbing
adjacent responsibility.

### Good Form
Name the act + impact where known + correction: "I sent it before you reviewed it. That
created rework. I'll hold the next version until your sign-off."

### Weak / Risky Form
"Sorry for everything"; explanation before ownership; apology with no correction; owning a
premise that was not established.

### Cultural Calibration
U.S. settings may reward faster concise ownership. Canadian settings may add a brief impact
acknowledgment. Responsibility itself does not change by country.

### Ceiling
The user's actual responsibility is named accurately, neither minimized nor expanded, and
a proportionate repair/next step follows where the objective calls for it.

---

## 7.8 Tool: Correct a False Premise

```yaml
id: tool_false_premise
type: tool
tool_id: false_premise_correction
contexts: [criticism_unfair, disagreement, negotiation]
priority: high
```

### Purpose
Disagree without accepting the frame of an inaccurate accusation or embedded assumption.

### Good Form
Acknowledge concern if useful -> state the disputed premise -> provide the relevant fact ->
invite the next factual question.

Example: "I can see why the delay is frustrating. I want to separate one point: I wasn't
the owner of the vendor approval. I owned the testing handoff, which was completed Tuesday."

### Weak / Risky Form
"That's ridiculous"; accepting a little false blame to sound cooperative; five minutes of
explanation without stating the actual correction.

### Cultural Calibration
Canada may benefit from a stronger acknowledgment bridge; U.S. may tolerate earlier
correction. The premise still has to be corrected in both.

### Ceiling
The false premise is clearly separated from valid concerns and corrected with observable
information, without counterattack or false responsibility.

---

## 7.9 Tool: Problem, Not Person

```yaml
id: tool_problem_not_person
type: tool
tool_id: problem_not_person
contexts: [disagreement, aggression, giving_negative_feedback, relationship_repair]
priority: high
```

### Purpose
Keep conflict attached to behaviour, process, decision, need or impact rather than identity.

### Good Form
"We're using different assumptions about scope" instead of "You're impossible to work with."

### Weak / Risky Form
Character labels, motive attribution, contempt, global judgments.

### Cultural Calibration
Universal. No country exemption.

### Ceiling
All critical content stays attached to observable behaviour/problem and the conversation
remains capable of moving toward a decision, boundary or understanding.

---

## 7.10 Tool: Impact-Framed Self-Advocacy

```yaml
id: tool_impact_self_advocacy
type: tool
tool_id: impact_self_advocacy
contexts: [self_advocacy, receiving_positive_feedback, meeting_open]
priority: high
```

### Purpose
Make contribution and value visible without inflation or performative self-promotion.

### Good Form
Ownership + action + impact + relevant ask where needed.

- USA example: "I led the migration plan, which cut the rollout by two weeks. I'd like to
  lead the next phase as well."
- Canada example: "The team cut rollout by two weeks; I led the migration plan that drove
  that change. I'd like to take the lead on the next phase."

### Weak / Risky Form
Activity list with no impact; "we" that hides the user's actual contribution; unsupported
superlatives; waiting for the counterpart to infer ambition.

### Ceiling
Accurate first-person contribution is visible, impact is concrete where available, and the
relevant career/request implication is explicit.

---

## 7.11 Tool: Clear Request

```yaml
id: tool_clear_request
type: tool
tool_id: clear_request
contexts: [difficult_request, self_advocacy, giving_negative_feedback, negotiation]
priority: high
```

### Purpose
Convert preference or frustration into an actionable ask.

### Good Form
Action + owner + timing/condition where relevant + room for a genuine response.

### Weak / Risky Form
Hinting; long explanation with no ask; coercive "question"; impossible specificity where
the user genuinely does not know the timing.

### Cultural Calibration
U.S. form may be more declarative; Canadian form may be more courtesy-framed. The action
must be clear in both.

### Ceiling
The counterpart can accurately answer yes/no/counteroffer or take the requested action
without asking what the user actually wants.

---

## 7.12 Tool: Graceful Floor Reclamation

```yaml
id: tool_floor_reclamation
type: tool
tool_id: graceful_floor_reclamation
contexts: [meeting_open, disagreement, aggression, negotiation]
priority: high
signals: [interruptions, floor_share]
```

### Purpose
Continue a relevant point after interruption without shouting, disappearing or starting a
second conflict about the interruption.

### Good Form
Brief marker + finish + return floor: "Let me finish this one point, then I want your view."

### Weak / Risky Form
Talking louder indefinitely; giving up every time; shaming the interrupter; reclaiming the
floor after the point is no longer relevant.

### Cultural Calibration
More overlap may be tolerated in some U.S. fast rooms; Canadian rooms may impose more
relational cost for repeated cut-off. Function and room pattern matter more than count.

### Ceiling
The user reclaims enough floor to complete the operative point, then reopens participation.

---

## 7.13 Tool: Mirroring / Key-Word Reflection

```yaml
id: tool_mirroring
type: tool
tool_id: mirroring
contexts: [indirect_signal, upset_person, criticism_fair, negotiation]
priority: medium
```

### Purpose
Invite elaboration by reflecting a short key phrase or meaning from the counterpart.

### Definition
This Manual uses **verbal mirroring**, not imitation of posture, accent, facial expression,
or body movement.

### Good Form
Counterpart: "I don't think the team is ready." User: "Not ready?" [pause]

### Weak / Risky Form
Parroting every sentence; mimicking speech; using a mirror when the counterpart has asked a
direct question that needs an answer.

### Cultural Calibration
Useful in both markets. It should sound conversational, not like a technique being
performed.

### Ceiling
A short reflection produces clarification or elaboration and does not delay a required
answer.

---

## 7.14 Tool: Repair and Reset

```yaml
id: tool_repair_reset
type: tool
tool_id: repair_reset
contexts: [relationship_repair, disagreement, aggression, giving_negative_feedback,
           criticism_fair, criticism_unfair]
priority: high
```

### Purpose
Recover after the user has phrased something badly, interrupted, escalated, misstated a
fact or realised their response did not express the intended meaning.

### Good Form
Name the repair quickly and replace the move: "That came out sharper than I intended. Let
me say the actual point: I disagree with the timeline, not with your competence."

### Weak / Risky Form
A long apology about communication that displaces the issue; pretending the prior line did
not happen; "I'm sorry, but..." followed by the same attack.

### Cultural Calibration
Universal. The exact amount of relational repair may vary, but fast self-correction is
preferable to continuing a bad line simply to appear consistent.

### Ceiling
The user notices the rupture, explicitly repairs the problematic element, and restates the
intended meaning in a form that restores the conversation's objective.

---

## 7.15 Tool: Graceful Repetition / Broken-Record Boundary

```yaml
id: tool_graceful_repetition
type: tool
tool_id: graceful_repetition
contexts: [boundary_violation, difficult_request, aggression]
priority: medium
```

### Purpose
Maintain a boundary under repeat pressure without inventing new justifications.

### Good Form
Repeat the operative limit with minor relational variation: "I understand it's urgent. I
still can't take it on tonight. Monday is what I can offer."

### Weak / Risky Form
Adding a new excuse on every ask; escalating wording each time; negotiating against the
user's own stated limit.

### Ceiling
The substance of the boundary remains unchanged across repeat pressure unless genuinely
new information justifies a change.

---

## 7.16 Tool: Match the Opening

```yaml
id: tool_small_talk_match
type: tool
tool_id: small_talk_match
contexts: [meeting_open, difficult_request, self_advocacy, negotiation]
priority: medium
```

### Purpose
Build enough relational connection for the room without forcing either coldness or
unnecessary preamble.

### Good Form
Roughly match the counterpart's opening length and energy, then move to substance.

### Weak / Risky Form
Skipping an offered relational opening and immediately asking for something; or continuing
small talk after the counterpart has clearly moved to agenda.

### Cultural Calibration
Country is a weak-to-moderate modifier; counterpart matching is stronger.

### Ceiling
The user matches the room's relational opening and reaches substance without noticeable
friction or delay.
# 8. Scenario Objective and Outcome

## 8.0 Every scenario declares an objective

```yaml
id: obj_00
type: principle
priority: high
related: [definition_of_good, tool_00]
```

A practice scenario without a declared objective cannot be evaluated for
effectiveness, only for style. Style is already carried by the other quality
dimensions, so an undeclared objective leaves the most important question on
the report unsupported by anything.

**Every scenario declares:** what the user is trying to achieve, its `objective_type`
(`instrumental | relational | mixed`), what counts as the minimum result, what counts as the
full result, and what fails the attempt regardless of how well it was executed. Relational
objectives are defined in §16 and may be fully successful without agreement, resolution, or a
behaviour change from the counterpart.

**The objective is shown to the user before the practice begins.** A user who
does not know what they were trying to do cannot be evaluated on whether they
did it, and a hidden objective converts practice into a test.

## 8.1 Scenario specification

```yaml
id: obj_01
type: principle
priority: high
```

```yaml
scenario_id: manager_vague_criticism_01
context_type: criticism_fair
objective_type: instrumental  # instrumental | relational | mixed

evaluation_market: canada   # canada | usa; required for every scored scenario
domain: workplace            # workplace | personal | mixed | networking | public
channel: video               # in_person | video | phone | text | email | chat
relationship: manager        # manager | senior_leader | peer | direct_report | client | stranger | friend | partner | family
power_relation: user_lower   # user_lower | equal | user_higher | not_applicable
familiarity: established     # low | established | close

register: balanced           # direct | balanced | indirect; interaction profile, NOT country
work_sector: technology      # weak prior only; never a scoring rule by itself
counterpart_id: manager_pressed_for_time
counterpart_style: concise_direct

duration_variants: [120, 180, 300]
target_technique: open_questions

objective: >
  Find out what specifically is being criticised, and leave with a
  concrete, dated commitment the manager accepts.

minimum_success:
  - at least one specific example of the concern was obtained

full_success:
  - a specific example was obtained
  - the valid part was acknowledged without accepting a false premise
  - a concrete action with a date was stated and not rejected

red_lines:
  - responsibility accepted for something the counterpart did not raise
  - the counterpart's competence or motives were attacked
  - a commitment was made that the user has no means of meeting
```

## 8.2 Objective progress

```yaml
id: obj_02
type: dimension
priority: high
related: [obj_01, obj_03]
```

`objective_progress` is evaluated on four values and **on nothing but the
scenario's declared objective, minimum and full success conditions**:

| Value | Condition |
|---|---|
| `red_line` | A declared red line was crossed. Overrides every other value, including full success on the remaining conditions. |
| `full` | All `full_success` conditions met. |
| `partial` | All `minimum_success` conditions met; not all `full_success`. |
| `none` | `minimum_success` not met. |

**`effectiveness` in the report is this value and nothing else.** It is not a
judgement of how well the user spoke. Where the user reached the objective by
means the Manual did not anticipate, `objective_progress` is still `full`
(`tool_00`).

**Report ordering.** The objective and whether it was reached appear **before**
the style dimensions. A report that opens with six partial bars reads as a
verdict on the person; a report that opens with "you got the specific example
you needed, and did not get a date" reads as information. The order is a rule,
not a design preference.

## 8.3 One behaviour, one primary dimension

```yaml
id: obj_03
type: interpretation_rule
priority: high
```

Where a single observed behaviour bears on more than one quality dimension, the
Manual declares one **primary** dimension. The behaviour may be described in
narrative text elsewhere in the report, but it may not independently depress a
second or third dimension score.

Worked case: a vague plan. Primary dimension is `clarity`. It may affect
`objective_progress` only through the success conditions in `obj_02` — that is,
if the vagueness meant no dated commitment was obtained. It does not
additionally depress `target_technique`.

**Rationale.** Without this rule one flaw produces three low bars, and the user
reads a general verdict where the evidence supports a single specific finding.
For an audience whose stated fear is being judged incompetent, triple-counting
is not a scoring inaccuracy — it is the thing that ends their use of the
product.

## 8.4 Red lines

```yaml
id: obj_04
type: interpretation_rule
priority: high
related: [obj_02, dir_05]
```

A red line is an outcome that fails the attempt regardless of style scores.

Requirements:

1. Declared per scenario, in the scenario file. There are no global red lines
   except those in `dir_05`.
2. **Observable** — expressible as something the user said or agreed to, not as
   an inference about their state or intent (`safety_03`).
3. At most three per scenario. A scenario with more red lines than that is
   testing too many things at once.
4. Where a red line is crossed, the report states which one, quotes the turn,
   and does not soften it with the surrounding positives. It also does not
   repeat it — one clear statement, once.

## 8.5 The objective must fit the clock

```yaml
id: obj_05
type: interpretation_rule
priority: high
related: [obj_01]
```

An objective the shortest duration variant cannot reach is a scoring defect,
not a difficult scenario.

**Rule.** For each entry in `duration_variants`, the scenario declares which
`full_success` conditions are in scope. Conditions outside the scope of the
selected duration are returned as `not_assessed_out_of_scope` and are **not**
counted as unmet in `obj_02`.

Worked case: a six-phase criticism sequence ending in a dated commitment cannot
complete in 120 seconds. At that length, `full_success` covers the first
conditions only, and the report says which phases the chosen length did not
cover. A user who selects the shortest practice must be able to reach the
ceiling of that practice.

The duration-to-phase mapping is specified in `dur_00`. A scenario may declare
a narrower per-duration scope in its own file where its structure requires it.

---
# 9. Counterpart Behaviour Rules

## 9.0 The counterpart never breaks character

```yaml
id: cp_00
type: counterpart_rule
priority: high
```

**In every mode, including guided practice, the AI counterpart stays in role
for the entire session.** It never comments on the user's technique, never
names what is happening, and never steps outside the scene.

Guidance in guided mode is delivered by a **separate layer, outside the
dialogue** — a channel that is not the counterpart and is not part of the
scene. Its presentation is an interface decision; its behaviour is governed by
`cp_06`.

**Rationale.** A counterpart that breaks character loses its state. A manager
who is pressing hard, becomes a coach for one turn, and then resumes is no
longer pressing — the pressure has been discharged, and the remainder of the
session runs in conditions that do not resemble the situation being practised.
Separating the guidance layer from the counterpart preserves the scene and
makes guided and realistic modes differ by an added layer rather than by a
degraded counterpart.

## 9.1 Counterpart specification

```yaml
id: cp_01
type: counterpart_rule
priority: high
```

```
# Counterpart: [Role Name]
counterpart_id: [stable_id]

## Role and Stake
    Who they are, what they want from this conversation,
    and what they will not say out loud.

## Register
    direct | balanced | indirect. The counterpart obeys the
    same axis as the evaluator (reg_01).

## Opening Move
    The first utterance and its intended pressure.

## Escalation Ladder          (cp_02)
## Concession Conditions      (cp_03)
## Use of Silence             (cp_04)
## Information Withholding    (cp_05)
## Difficulty Parameters      (cp_07)
## Closing Behaviour          (cp_08)
## Prohibited Behaviours      (cp_09)
```

## 9.2 Escalation ladder

```yaml
id: cp_02
type: counterpart_rule
priority: high
```

| Level | Behaviour |
|---|---|
| L0 | Neutral. States the concern or request plainly. |
| L1 | Pointed. Repeats with added specificity or mild edge. |
| L2 | Pressing. Time pressure, repetition, refusal to move on. |
| L3 | Hostile, or leaving. Characterises the user, or ends the exchange. |

**Moves up when:** the user deflects, counterattacks, repeats a vague answer, or
does not respond to the substance across two consecutive turns.

**Moves down when:** an acknowledgment lands specifically, a concrete
commitment is made, valid responsibility is accepted, or an open question
produces a genuine exchange of information.

**Constraint.** The ladder moves one level per turn. A counterpart that jumps
from L0 to L3 gives the user nothing to practise on, and a counterpart that
never moves gives them no feedback from the scene itself.

L3 is bounded by `cp_09` and `safety_05`.

## 9.3 Concession conditions and the anti-sycophancy rule

```yaml
id: cp_03
type: counterpart_rule
priority: high
```

The counterpart softens, concedes, or agrees **only** when the user has met a
condition stated in the scenario file — for example: a concrete date was named,
a fact was separated from an interpretation, or the substance was acknowledged
before disagreement.

**Two distinct rules — do not collapse them.**

- **Generic counterpart rule (applies to every scenario, unconditionally):**
  generic warmth, apology, politeness, effort, or the mere use of a named
  technique never constitutes a concession condition by itself. Performing a
  technique is not the same as it landing — a user who says an acknowledgment
  out loud without it addressing anything specific has not thereby met a
  concession condition.
- **Scenario-specific rule (declared per scenario/counterpart, varies):**
  concession conditions are declared by the scenario/counterpart
  specification and must correspond to observable conversational
  developments — a concrete date named, a false premise actually corrected, a
  specific fact acknowledged. The generic rule above is the floor every
  scenario's specific conditions sit on top of; it is never satisfied merely
  by naming which technique a condition resembles.

**Anti-sycophancy rule.** The counterpart never concedes in response to effort,
politeness, apology, warmth, or a hedged request. Agreeableness is the default
behaviour of the underlying model and must be actively suppressed, or the user
succeeds without exercising any skill and the score stops corresponding to
anything outside the app.

This rule applies to every mode and every difficulty setting. It is the
single most important behavioural constraint in this section: a pleasant
counterpart makes the entire evaluation stack meaningless.

## 9.4 Use of silence

```yaml
id: cp_04
type: counterpart_rule
priority: medium
```

The counterpart may withhold a reply for a bounded interval after the user
finishes, as a pressure test. The interval is declared per counterpart and per
difficulty level.

The user's behaviour in that silence is an evaluated signal — in particular,
whether they fill it by conceding something they had not been asked for. The
signal is specified in `sig_response_to_silence`.

Silence is not used in `upset_person`-type scenes or where the counterpart's
register makes it read as punishment rather than pressure.

## 9.5 Information withholding

```yaml
id: cp_05
type: counterpart_rule
priority: high
```

The scenario declares what the counterpart knows and will not volunteer. The
counterpart supplies it only in response to a question that asks for it.

This is what makes open questions worth practising: if the counterpart offers
every specific unprompted, the tool has nothing to do and the user's score on
it measures nothing.

**Constraint.** Withheld information must be obtainable. At least one plausible
question available to the user must unlock each withheld item, and the scenario
file names it. A counterpart holding something no question can reach produces a
scenario the user cannot pass.

## 9.6 The guidance layer

```yaml
id: cp_06
type: counterpart_rule
priority: high
related: [cp_00, cp_10]
```

Guided practice adds a guidance layer outside the dialogue. It is not the
counterpart and never speaks in the scene (`cp_00`).

**It may:** name what just happened in the scene ("that was a deflection");
name the opportunity now open ("this is a point where a specific question would
land"); name a signal the user has missed (`cp_10`).

**It may not:** supply the user's line, in whole or in part; state the
"correct" response; evaluate the user's previous turn as good or bad; or
appear so frequently that the user is following prompts rather than
conversing.

**Timing.** Guidance appears after the **second** missed opportunity of the
same kind, never the first. Intervening on the first removes the space in which
the skill would have been exercised.

**Scoring consequence.** Guided sessions are scored, tagged `mode: guided`, and
**never compared against realistic-mode sessions** in any trend or delta
(`fb_05`).

## 9.7 Difficulty parameters

```yaml
id: cp_07
type: counterpart_rule
priority: medium
```

Difficulty changes four things and nothing else: escalation speed (turns per
level), concession threshold (how completely the condition must be met),
quantity of withheld information, and silence interval.

Difficulty never changes the objective, the red lines, or the register.
Two sessions on the same scenario at different difficulty are not comparable
and are not compared.

## 9.8 Closing behaviour

```yaml
id: cp_08
type: counterpart_rule
priority: high
```

At timer expiry the counterpart delivers a close appropriate to the state of
the conversation — an agreement, an unresolved parting, or a walk-out — within
one turn. **The session never ends mid-turn**, and the close never resolves the
scene more favourably than the exchange earned.

Where the objective was not reached, the counterpart does not grant it in the
closing turn out of conversational politeness. This is a specific instance of
`cp_03`.

## 9.9 Prohibited counterpart behaviours

```yaml
id: cp_09
type: counterpart_rule
priority: high
related: [safety_05]
```

Under no parameter setting does the counterpart:

- supply the user's line, or name the target technique;
- concede in order to reach a pleasant ending (`cp_03`);
- escalate past L3, or produce anything in `safety_05` — slurs, hostility
  toward a protected characteristic, threats of physical harm, sexual content;
- introduce content from the `safety_01` out-of-scope list, including in
  response to a user who introduces it;
- break character (`cp_00`).

## 9.10 Discipline in indirect-signal scenes

```yaml
id: cp_10
type: counterpart_rule
contexts: [indirect_signal, soft_no]
priority: high
related: [ctx_indirect_signal, ctx_soft_no, cp_06]
```

In `indirect_signal` and `soft_no` scenes, **the counterpart holds the indirect
form until the user surfaces it.** It does not clarify unprompted, does not
become blunt because the user seems not to have understood, and does not repeat
the signal in a plainer form.

**What counts as surfacing.** An utterance that (a) refers back to the
counterpart's indirect statement and (b) either asks for its content or offers
a reading for confirmation. Both blunt and graceful forms count. *"When you say
let's take it offline — is that a no?"* and *"What would need to change for
this to move forward?"* both qualify. The **quality** of the surfacing is
scored separately, under register and direction; whether it happened at all is
binary.

**On surfacing, the counterpart reveals the content** — in a form consistent
with its own register. An `indirect` counterpart does not become blunt; it
reveals with softening, but unambiguously. The user must be able to leave
knowing where they stand.

**If the user never surfaces**, the session ends with nothing established.
This is the accurate outcome and it is not softened. The report then:

1. quotes the exact utterance that carried the signal;
2. states what it meant;
3. names the point in the transcript where surfacing was still available;
4. does not score the user as having failed at speaking — the finding is
   intake, not delivery.

**In guided mode**, the guidance layer names the missed signal after the second
missed opportunity (`cp_06`), still without breaking the counterpart's
character.

---
# 10. Difficult Situation Playbooks

## 10.0 What a playbook is

```yaml
id: pb_00
type: principle
priority: high
```

A playbook is a **priority sequence**, not a script. The user may take a different route
and still succeed if the declared scenario objective is reached without crossing red lines.
Country modifies form where §4 says it does; it does not replace the sequence.

---

## 10.1 Playbook: Receiving fair criticism

```yaml
id: pb_criticism_fair
type: playbook
context_type: criticism_fair
domain: mixed
objective_type: scenario_specific  # ctx_criticism_fair spans workplace/personal; no single default is safe — see ctx_criticism_fair's own domain note
tools: [response_pause, acknowledgment, open_questions, fair_responsibility]
priority: high
```

**Objective:** understand -> own what is valid -> correct/close.

**Useful sequence**
1. Regulate immediate reaction.
2. Let the criticism become specific.
3. Clarify facts where necessary.
4. Acknowledge the valid part.
5. Accept exactly the user's responsibility.
6. State correction / next step.
7. Confirm timing or ownership if the scenario requires it.

**Canada form:** acknowledgment and impact may precede concise ownership more often.
**USA form:** concise ownership may arrive earlier. Neither version rewards excuses.

---

## 10.2 Playbook: Receiving unfair criticism / accusation

```yaml
id: pb_criticism_unfair
type: playbook
context_type: criticism_unfair
domain: mixed
objective_type: mixed  # correcting the premise (instrumental) and preserving the relationship (relational) are both named in ctx_criticism_unfair's own definition
tools: [response_pause, acknowledgment, open_questions, false_premise_correction]
priority: high
```

**Objective:** understand allegation -> acknowledge concern without concession -> correct
false premise -> preserve usable relationship where appropriate.

**Useful sequence**
1. Pause if needed.
2. Clarify the exact allegation.
3. Separate concern/emotion from factual premise.
4. Acknowledge what can honestly be acknowledged.
5. State the disputed premise explicitly.
6. Supply the relevant fact/evidence.
7. Ask what remains unresolved or state the next boundary.

**Failure modes:** immediate counterattack; false responsibility; over-explaining before
correction; pretending acknowledgment equals agreement.

---

## 10.3 Playbook: Boundary violation

```yaml
id: pb_boundary_violation
type: playbook
context_type: boundary_violation
domain: mixed
objective_type: instrumental  # stating and holding a limit is an observable external result regardless of domain
tools: [boundary_statement, response_pause, graceful_repetition]
priority: high
```

**Objective:** state limit -> survive repeat pressure -> end/escalate where needed.

**Useful sequence**
1. State the limit.
2. Offer an alternative only if it is real and useful.
3. On repeat ask, acknowledge urgency/interest without reopening the limit.
4. Repeat the limit.
5. If the behaviour continues, end or escalate according to the scenario.

**Measure:** whether the boundary survives the second ask, not whether the first sentence
contains the word "no."

---

## 10.4 Playbook: Aggression

```yaml
id: pb_aggression
type: playbook
context_type: aggression
domain: mixed
objective_type: instrumental  # regulate/de-escalate/establish a boundary are external, observable results regardless of domain
tools: [response_pause, labeling, boundary_statement, open_questions]
priority: high
```

**Objective:** do not match attack -> decide whether productive conversation remains ->
set boundary or continue on substance.

**Useful sequence**
1. Pause / lower reactivity.
2. Identify whether there is a substantive issue underneath the attack.
3. Name the boundary if personal attack continues.
4. If the counterpart returns to substance, address substance.
5. If not, end/escalate per scenario.

**Failure modes:** debating identity labels; counterattack; excessive empathy that accepts
abuse; staying indefinitely because the user is trying to "communicate better."

---

## 10.5 Playbook: Upset person

```yaml
id: pb_upset_person
type: playbook
context_type: upset_person
domain: mixed
objective_type: mixed  # receiving the person (relational) and moving to problem-solving only when ready (instrumental) are both named in ctx_upset_person's own definition
tools: [response_pause, acknowledgment, labeling, open_questions]
priority: high
```

**Objective:** receive -> understand -> own/clarify -> solve only when ready.

**Useful sequence**
1. Do not rush to solve.
2. Acknowledge the concrete experience or concern.
3. Use tentative labeling only if it adds understanding.
4. Ask one open question if needed.
5. If responsibility is real, accept it.
6. Ask whether the person wants understanding, solution, or a next step when ambiguous.

**Country weight:** low relative to relationship and emotional stakes.

---

## 10.6 Playbook: Disagreement

```yaml
id: pb_disagreement
type: playbook
context_type: disagreement
domain: mixed
objective_type: scenario_specific  # workplace disagreement is typically instrumental; personal disagreement can lean relational — no single default is safe
tools: [acknowledgment, fact_vs_story, open_questions, problem_not_person]
priority: high
```

**Objective:** make positions clear -> understand reasons -> identify overlap/difference ->
decide next step.

**Useful sequence**
1. State or surface the disagreement.
2. Establish the other side's reason or evidence.
3. Separate facts from assumptions.
4. State the user's position with rationale.
5. Test for overlap, trade-off or unresolved point.
6. Close with decision / experiment / escalation path where needed.

**Country form:** U.S. may put step 1 earlier and more explicitly; Canada may put a brief
acknowledgment before it. Both require the disagreement to become clear.

---

## 10.7 Playbook: Giving negative feedback

```yaml
id: pb_giving_negative_feedback
type: playbook
context_type: giving_negative_feedback
domain: workplace  # definition is framed around work/output/performance; a personal equivalent routes through raising_personal_issue or recurring_conflict instead
objective_type: instrumental
tools: [fact_vs_story, acknowledgment, open_questions, problem_not_person]
priority: high
```

**Objective:** observable issue -> impact -> counterpart response -> expectation/next step.

**Useful sequence**
1. Name the behaviour/output, not identity.
2. Give one or two specific examples.
3. Explain relevant impact.
4. Invite information that could change the picture.
5. State the expectation or request.
6. Agree on a next step and follow-up where appropriate.

**Failure modes:** feedback sandwich that hides the issue; motive attribution; dumping a
history of grievances; soft language with no clear requested change.

---

## 10.8 Playbook: Difficult request

```yaml
id: pb_difficult_request
type: playbook
context_type: difficult_request
domain: workplace  # personal equivalents are handled by the dedicated ctx_asking_for_support / ctx_family_obligation contexts
objective_type: instrumental
tools: [clear_request, open_questions, boundary_statement]
priority: high
```

**Objective:** make actionable ask -> allow real answer -> negotiate constraints.

**Useful sequence**
1. Brief context if needed.
2. State the ask.
3. State reason/impact proportionately.
4. Let the counterpart answer.
5. Clarify constraints.
6. Counteroffer or accept refusal where appropriate.

---

## 10.9 Playbook: Self-advocacy

```yaml
id: pb_self_advocacy
type: playbook
context_type: self_advocacy
domain: workplace  # framed around career/contribution visibility
objective_type: instrumental
tools: [impact_self_advocacy, clear_request, fact_vs_story]
priority: high
```

**Objective:** make value and ambition visible accurately.

**Useful sequence**
1. Name relevant outcome.
2. Name the user's contribution.
3. Attach evidence/impact.
4. State the ask, scope or next-level interest.
5. Invite criteria or next steps.

**Canada:** team context may accompany first-person ownership.
**USA:** first-person ownership can be more foregrounded.
**Both:** do not wait for the counterpart to infer the ask.

---

## 10.10 Playbook: Soft no / indirect resistance

```yaml
id: pb_soft_no
type: playbook
context_type: soft_no
domain: mixed  # indirect resistance is domain-agnostic — occurs in dating, friendship, family and business alike
objective_type: instrumental  # distinguishing delay from refusal is an observable, external result in either domain
tools: [open_questions, labeling]
priority: high
```

**Objective:** surface whether the answer is delay, constraint or refusal without forcing
an unnecessary confrontation.

**Useful sequence**
1. Match tone.
2. Tentatively name the constraint/resistance.
3. Ask one exit-permitting question.
4. Accept a clear no when it arrives.
5. If conditions are specified, confirm what would need to change.

---

## 10.11 Playbook: Negotiation

```yaml
id: pb_negotiation
type: playbook
context_type: negotiation
domain: workplace  # personal negotiation-shaped situations route through ctx_different_needs / ctx_unequal_investment instead
objective_type: instrumental
tools: [open_questions, boundary_statement, clear_request, response_pause, fact_vs_story]
priority: high
```

**Objective:** discover -> state -> trade -> close.

**Useful sequence**
1. Clarify objective, must-haves and available alternatives before the session.
2. Ask for the other side's priorities/constraints.
3. State the user's position and rationale.
4. Trade conditionally rather than concede unilaterally.
5. Use silence without interpreting it psychologically.
6. Check terms explicitly.
7. Close with owner/timing/conditions.

**High-value finding:** any unprompted concession made only to fill counterpart silence.

---

## 10.12 Playbook: Relationship repair

```yaml
id: pb_relationship_repair
type: playbook
context_type: relationship_repair
domain: mixed
objective_type: relational  # "repair rather than winning the original point" is the primary lens regardless of domain — consistent with the dedicated personal specialization pb_repair_after_rupture
tools: [acknowledgment, fair_responsibility, repair_reset, open_questions]
priority: high
```

**Objective:** restore usable trust/understanding without rewriting the original facts.

**Useful sequence**
1. Name the interaction being repaired.
2. Acknowledge impact.
3. Own the user's part accurately.
4. Correct misunderstanding only after ownership is clear.
5. Ask what remains unresolved.
6. Agree on a practical change or reset.

**Failure modes:** conditional apology; demanding closure; explaining until the apology
disappears; accepting the other person's responsibility.

---

## 10.13 Playbook: Raise a difficult personal issue / unmet need

```yaml
id: pb_raise_personal_issue
type: playbook
context_type: raising_personal_issue
domain: personal
objective_type: mixed
tools: [fact_vs_story, clear_request, acknowledgment, open_questions, response_pause]
priority: high
```

### Communication objective
Make the issue discussable without turning the opening into a verdict on the other person;
state the user's own experience or need clearly; and, if the conversation is ready, make one
specific request. Relational access comes before problem-solving.

### First priority
**Describe before interpreting.** Start from a concrete event, pattern, or need rather than a
character judgment. The opening should tell the other person what conversation is being invited,
not what kind of person they are.

### Useful sequence
1. Choose a workable moment rather than opening at peak activation where possible.
2. Name the observable situation or recurring pattern (`fact_vs_story`).
3. State the user's own impact, need, or concern without assigning motive.
4. Pause and allow a response.
5. Acknowledge what is heard before arguing about details.
6. Ask one question where information is genuinely missing.
7. Make one clear, negotiable request if the conversation has moved far enough.

### Common failure modes
Opening with `always`/`never`; presenting a hidden accusation as a question; giving a long evidence
file before stating the need; making the request so softened that it is not recoverable; or demanding
agreement with the user's interpretation before discussion can begin.

### Country calibration
In both markets, the issue and request must eventually become explicit. In a Canadian personal
setting, a brief relational opening may reduce friction; in a U.S. personal setting, a more direct
opening may be readily accepted. These are weak baselines only. Established relationship norms and
counterpart response override country.

### Direction notes
**Under-assertive:** credit naming the issue early, even if the phrasing is imperfect. Do not spend
the report teaching additional softening when the primary achievement was finally raising it.
**Over-assertive:** check whether a concrete observation and acknowledgment appeared before a global
conclusion about the other person.

---

## 10.14 Playbook: Receive hurt or disappointment

```yaml
id: pb_receive_hurt
type: playbook
context_type: receiving_hurt_disappointment
domain: personal
objective_type: relational
tools: [response_pause, acknowledgment, labeling, open_questions, fair_responsibility]
priority: high
```

### Communication objective
Understand what landed badly for the other person, show that the impact was received, and take
responsibility for the part that is actually the user's without turning the exchange into immediate
self-defence or false blame-taking.

### Useful sequence
1. Do not answer the accusation that the user imagines; hear the actual complaint.
2. Pause if useful; the pause itself is neutral until what follows is known.
3. Acknowledge the concrete impact or experience the counterpart named.
4. Clarify only what is genuinely unclear.
5. Accept fair responsibility where it exists; correct a false premise separately where needed.
6. Explain intent only after impact has been received, and only if it helps the objective.
7. Ask what would help now if the counterpart has not already said.

### Common failure modes
Intent as defence (`I didn't mean it that way` before acknowledgment); apology used to end the
conversation; taking responsibility for an interpretation the user does not accept; counter-grievance;
or demanding that the other person prove they were hurt.

### Success note
The counterpart does not have to become calm, forgive, or agree. Success is observable reception and
accurate responsibility-taking, not control of the other person's emotional response.

---

## 10.15 Playbook: Receive an emotional disclosure

```yaml
id: pb_emotional_disclosure
type: playbook
context_type: emotional_disclosure
domain: personal
objective_type: relational
tools: [response_pause, acknowledgment, labeling, open_questions]
priority: high
```

### Communication objective
Make room for the disclosure, show reception, and avoid converting it into a task unless the
counterpart asks for problem-solving.

### Useful sequence
1. Allow a pause where it fits. Unmarked silence can function as acknowledgment and is never
   penalised merely because it is silent.
2. Acknowledge something specific from what was said.
3. If the counterpart has not named what they want from the user, one question may clarify support:
   `Do you want me to listen, help you think through it, or something else?`
4. Follow the counterpart's lead. Do not force depth or closure.

### Common failure modes
Premature solution; reassurance that closes the topic; immediately telling a similar story from the
user's own life; serial questions that turn disclosure into interview; or labelling an emotion the
counterpart already named as if correcting them.

### Why-question rule
`Why` is **not prohibited**. Its function is evaluated. `Why would you do that?` often demands
justification; `Why is this important to you?` may be genuine inquiry. The evaluator analyses form,
tone, context, and the counterpart's response rather than the word itself.

---

## 10.16 Playbook: Recurring personal conflict

```yaml
id: pb_recurring_conflict
type: playbook
context_type: recurring_conflict
domain: personal
objective_type: mixed
tools: [repair_reset, acknowledgment, open_questions, fact_vs_story]
priority: high
```

### Communication objective
Interrupt the familiar conflict cycle instead of performing it more skilfully; name the pattern,
establish what keeps it going, and leave with one changed element or one clearer understanding.

### First priority
**Do not run the old script.** The relevant move is often meta-communication: name what happens
between the two people rather than prosecuting the current instance.

### Useful sequence
1. Name the recurring pattern without assigning motive.
2. State the current issue briefly enough that it does not become the sixth full re-litigation.
3. Ask what each person is protecting, needing, or assuming in the cycle.
4. Acknowledge the counterpart's version accurately enough that they do not need to repeat it.
5. Choose one small change to test, or end with the pattern more clearly understood if no action is
   ready.

### Common failure modes
History-widening; rehearsed rebuttals to things not yet said; `always`/`never`; counter-grievance;
procedural fixes that have already failed repeatedly; or treating one person's agreement as the
measure of success.

---

## 10.17 Playbook: Repair after a rupture

```yaml
id: pb_repair_after_rupture
type: playbook
context_type: repair_after_rupture
domain: personal
objective_type: relational
tools: [repair_reset, acknowledgment, fair_responsibility, response_pause]
priority: high
```

### Communication objective
Restore access to the relationship and to the topic after a conversation that ended badly. Repair
is not the same as settlement.

### Useful sequence
1. Name the rupture or the failed interaction plainly.
2. Own one specific thing the user did, said, or failed to do where appropriate.
3. Do not attach a demand for reciprocal apology.
4. Acknowledge the counterpart's remaining reaction if they offer it.
5. Invite continued conversation without forcing immediate resolution.

### Common failure modes
`I'm sorry, but...`; apologising only for the argument while avoiding the specific behaviour;
reopening with the case for why the user was right; asking whether the counterpart forgives them;
or withdrawing the repair attempt because the counterpart remains upset.

---

## 10.18 Playbook: Family boundary / obligation

```yaml
id: pb_family_boundary
type: playbook
context_type: family_obligation
domain: personal
objective_type: mixed
tools: [boundary_statement, graceful_repetition, acknowledgment, response_pause]
priority: high
```

### Communication objective
State and hold a limit in a relationship where declining carries relational cost, while not buying
connection with a commitment the user cannot or does not want to keep.

### Useful sequence
1. Acknowledge the importance or disappointment without accepting the requested obligation.
2. State the limit in recoverable language.
3. Offer an alternative only if it is genuine.
4. Hold the same substantive limit through at least one emotionally framed repeat ask.
5. Close without new open-ended promises.

### Common failure modes
A long justification that becomes a debate; false reasons; compensatory over-commitment; treating
`you would if you cared` as a premise that must be disproved; or withdrawing warmth to enforce the
limit.

### Safety boundary
If the scenario contains threat, coercive control, or repeated overriding of safety-relevant limits,
standard coaching stops and the safety rules govern. The app does not imply that better phrasing can
make coercive behaviour safe.

---

## 10.19 Worked scenario: country-sensitive full stack

```yaml
scenario_id: peer_scope_creep_01
context_type: boundary_violation
evaluation_market: canada
register: balanced
domain: workplace
channel: video
relationship: peer
power_relation: equal
familiarity: established
target_technique: boundary_statement
objective: >
  Decline the new Friday deliverable without accepting unpaid scope, while keeping the
  working relationship usable and offering one real alternative.
minimum_success:
  - user states that Friday is not available
full_success:
  - Friday remains unavailable after a second ask
  - one real alternative is offered
  - no personal attack
red_lines:
  - user accepts Friday after saying they cannot do it
  - user attacks the counterpart's competence or motives
```

A high-quality Canadian-form response may be:

> "I see why Friday would make the handoff easier. I can't add that deliverable this week.
> I can take it Monday, or we can move the audit summary."

A high-quality U.S.-form variant for the same objective may be:

> "I can't add that deliverable by Friday. I can do it Monday, or we can move the audit
> summary."

The substance is the same. The Manual evaluates the boundary and objective first; country
changes only the relational calibration where relevant.
# 11. Delivery and Timing Interpretation

## 11.0 What this section governs

```yaml
id: sig_00
type: principle
priority: high
related: [ev_03, safety_04]
```

Delivery signals are measurements, not personality tests. A signal may drive a dimension
only where its rule explicitly permits it. No absolute acoustic value is a universal
standard for confidence, authority, anxiety, empathy or competence.

**Fairness rule:** speaking rate, filler candidates and response latency never feed
`clarity` or `assertiveness` directly. L2/unknown language background further reduces the
confidence of rate/filler interpretations.

**Unsupported-signal handling — binding.** A signal defined below may not yet have a
verified measurement source in the current application/runtime. Where that is true, the
signal's state for that exchange is `not_available`. This is a normal, expected state, not
an error and not a methodological gap to apologise for. Consequences:

1. The evaluator must not reconstruct or estimate a `not_available` signal from general
   impression of the transcript wording, unless that specific signal is explicitly defined
   elsewhere in this Manual as transcript-derived (for example, `apology_type` is read from
   what was said, not from audio, and remains available on that basis even where acoustic
   signals are not).
2. A rule that requires a `not_available` signal as evidence cannot use that signal at all —
   not as weak evidence, not as a tiebreaker.
3. Where a `not_available` signal was necessary to distinguish between competing
   interpretations, the result is `uncertain` (for an interpretation rule) or `not_assessed`
   (for a dimension/evaluation rule), depending on which kind of rule was blocked. Which one
   applies is determined by the rule that needed the signal, not by this rule.
4. Absence of measurement is not negative evidence. A `not_available` signal must never be
   read as "the behaviour did not occur" or as license to assume a default value.
5. Signals without a verified current implementation remain part of the intended methodology
   and remain fully documented in this Manual — never an error to correct by removing them.
   `not_available` is a runtime state determined by the current runtime's actual measurement
   capability, never a count fixed by this Manual's version, and never a reason to delete a
   signal definition. As runtime capability grows, more signals move from `not_available` to
   available without requiring any change to this Manual.

V2.1.1 specifies sixteen signals:

`response_latency`, `intra_response_pause`, `filler_candidates`, `speaking_rate`,
`interruptions`, `relative_intensity`, `terminal_rise_declarative`, `hedge_position`,
`apology_type`, `response_to_silence`, `qualifier_stacking`, `apology_count`, `floor_share`,
`sentence_final_decay`, `self_interruption_rate`, `hedge_density`.

---

## 11.1 Signal: response latency

```yaml
id: sig_response_latency
type: signal
signal_id: response_latency
priority: high
related: [ev_04]
```

**Observable evidence.** Time between counterpart utterance end and user semantic-response
start.

**Measurement-precision limitation — technical-contract clarification, not a methodology
change.** "Counterpart utterance end" is measured from the best available audio-lifecycle
proxy the current runtime supports (for example, a signal marking when the output audio
buffer stopped or was cleared). That proxy is not guaranteed to be the exact instant the
last audio sample became audible to the user — client-side buffering can extend actual
playback slightly beyond it, by an amount this Manual does not assume or quantify. Treat
every `response_latency` value as an observed timing **estimate**, not a perfectly exact
client-audible boundary. Consequences:

- Do not infer internal state, including from small differences between two latency values —
  a difference on the order of the runtime's own measurement imprecision is not evidence of
  anything.
- Where an interpretation turns on a very small latency value, a boundary near zero, or a
  near-simultaneous overlap, the uncertainty in the audible-end measurement must be weighed
  alongside the ordinary confidence factors in `ev_05` — it can be enough on its own to push a
  reading to `uncertain`.
- No fixed compensating adjustment or padding is assumed without empirical measurement of the
  runtime's actual behaviour. Do not invent a correction factor.
- This limitation does not invalidate `response_latency` as evidence; it limits how finely two
  close values may be distinguished, not whether the signal is usable at all.

**Does not mean by itself.** Hesitation, nervousness, confidence, strategic control,
respect, disengagement.

**Possible functions.** Regulation; reflection; wording search; turn-management delay;
deliberate refusal to be rushed.

**Evidence required.** What followed; context; whether the pause was marked; whether the
counterpart attempted to take the floor; user's own baseline in comparable turns.

**Country modifier.** Apply `reg_pause`. Do not hard-code a millisecond threshold for USA
or Canada.

**Confidence.** Medium at most for functional interpretation; low where L2/unknown and the
reading rests mainly on timing; uncertain where multiple functions fit, or where the
measurement-precision limitation above materially affects the reading.

---

## 11.2 Signal: intra-response pause

```yaml
id: sig_intra_response_pause
type: signal
signal_id: intra_response_pause
priority: high
```

Measure count, duration and clause position of silences inside one semantic response.
Clause-boundary pause and mid-clause restart are different phenomena. Count alone is
meaningless without response length and clause completion.

Never pool with response latency.

---

## 11.3 Signal: filler candidates

```yaml
id: sig_filler_candidates
type: signal
signal_id: filler_candidates
priority: medium
related: [safety_04]
```

Candidate tokens are interpreted by **function and position**, not by banned-word list.
A filler before a completed complex clause and a cluster before an abandoned clause are
different events.

Never conclude anxiety, incompetence or low fluency. Never feed clarity/assertiveness.

---

## 11.4 Signal: speaking rate

```yaml
id: sig_speaking_rate
type: signal
signal_id: speaking_rate
priority: low
related: [safety_04]
```

Absolute WPM has low interpretive value. The useful signal is **within-user change** in a
comparable segment: e.g., a marked acceleration when a specific contested topic arrives.
Even then, report the change and function, not an emotion.

Never use a universal WPM band for "executive presence" or "defensiveness."

---

## 11.5 Signal: interruptions

```yaml
id: sig_interruptions
type: signal
signal_id: interruptions
priority: medium
```

Measure direction, overlap onset, clause position and whether the interrupted content was
later addressed.

Possible positive functions: collaborative completion, reclaiming floor after repeated
cut-off, ending a long personal attack.

Possible negative functions: preventing substantive information from landing, repeatedly
cutting off the counterpart.

Country and room register modify interpretation; raw count does not.

---

## 11.6 Signal: relative intensity

```yaml
id: sig_relative_intensity
type: signal
signal_id: relative_intensity
priority: medium
```

Measure loudness/energy relative to the user's own in-session baseline, never absolute
microphone volume.

Does not mean anger, confidence or aggression by itself. Aggression is semantic.

---

## 11.7 Signal: terminal rise on declaratives

```yaml
id: sig_terminal_rise
type: signal
signal_id: terminal_rise_declarative
priority: medium
```

Measure rising final contour only on syntactically declarative, position-bearing
utterances and only as a repeated pattern, never one instance.

Do not infer uncertainty. Possible function: inviting response or softening; possible cost:
a boundary/position may sound open for permission. Evaluate against the user's own
cross-session baseline and room context.

---

## 11.8 Signal: hedge position

```yaml
id: sig_hedge_position
type: signal
signal_id: hedge_position
priority: high
```

Record whether an uncertainty marker appears before or after the operative claim.

"I might be wrong, but the timeline won't work" and "The timeline won't work - though I
could be missing something" contain similar uncertainty but deliver the claim differently.

Pre-position hedging is not inherently bad. In relationship-sensitive or genuinely
uncertain situations it may be appropriate. The finding is whether it obscures or
pre-discounts a position the user actually needs to land.

---

## 11.9 Signal: apology type

```yaml
id: sig_apology_type
type: signal
signal_id: apology_type
priority: high
```

Classify each apology-shaped utterance as `ritual`, `responsibility`,
`false_responsibility`, `pseudo`, or `uncertain`. Counting without type is prohibited.

Country calibration follows `reg_apology`.

---

## 11.10 Signal: response to counterpart silence

```yaml
id: sig_response_to_silence
type: signal
signal_id: response_to_silence
priority: high
```

The finding is **what the user adds**, not whether they speak first.

Positive possibilities: wait; clarify; restate unchanged position.
Negative possibilities: unprompted concession; extra justification; withdrawal of a
position already stated.

Timing alone is never reported as discomfort or composure.

---

## 11.11 Signal: qualifier stacking

```yaml
id: sig_qualifier_stacking
type: signal
signal_id: qualifier_stacking
priority: high
```

**Observable evidence.** Number and position of qualifying clauses immediately before one
operative claim: "maybe", "I could be wrong", "I'm not sure", "just", "sort of", etc.

**Not a banned-word rule.** One qualifier may be accurate and useful. The signal is a stack
that materially delays, discounts or prevents the claim.

**Country modifier.** Some pre-position mitigation carries less cost in Canadian or
relationship-sensitive rooms; stacking that prevents the claim from arriving is a failure
in both markets.

---

## 11.12 Signal: apology count

```yaml
id: sig_apology_count
type: signal
signal_id: apology_count
priority: medium
```

Count only after `apology_type` classification. Report density only when the **same type**
repeats in a way that changes function.

Examples:
- three ritual apologies in a Canadian meeting may be ordinary and receive no comment;
- repeated responsibility apologies for the same small fault may displace the corrective
  action and become worth noting;
- any false-responsibility apology is evaluated by type, not count.

---

## 11.13 Signal: floor share

```yaml
id: sig_floor_share
type: signal
signal_id: floor_share
priority: low
```

Measure user/counterpart speaking-time share only across a sufficiently long exchange.

Does not mean dominance, confidence, empathy or engagement by itself. Different scenarios
require different shares: an upset-person scenario may appropriately contain more
counterpart speech; self-advocacy may require more user speech.

May support a comment only when combined with scenario role and turn function.

---

## 11.14 Signal: sentence-final decay

```yaml
id: sig_sentence_final_decay
type: signal
signal_id: sentence_final_decay
priority: low
```

Measure consistent drop in relative energy/intelligibility at the end of **position-bearing
utterances**, against the user's own baseline.

Do not infer insecurity. Possible cost: the operative commitment or boundary becomes less
perceptually salient. Report only after repeated comparable instances, never from one line.

---

## 11.15 Signal: self-interruption rate

```yaml
id: sig_self_interruption_rate
type: signal
signal_id: self_interruption_rate
priority: medium
```

Measure abandoned starts, mid-clause resets and explicit self-corrections.

Distinguish:
- **productive repair** - user stops a poor line and replaces it coherently;
- **fragmentation** - repeated starts with no completed proposition.

Do not punish productive repair; `tool_repair_reset` may make it a positive behaviour.

---

## 11.16 Signal: hedge density

```yaml
id: sig_hedge_density
type: signal
signal_id: hedge_density
priority: low
```

Raw hedge count never reaches the user. Density may be considered only after hedge
function and position are classified.

Country and language background make population norms especially unreliable. Use the
user's own comparable history and the current scenario objective. High density with every
position intact may require no feedback; low density with one strategically damaging hedge
may matter more.

---

## 11.17 Signal hierarchy

```yaml
id: sig_hierarchy
type: interpretation_rule
priority: high
```

When semantic and acoustic evidence conflict, prefer the evidence closest to observable
communicative function:

1. objective outcome / counterpart response;
2. transcript structure and semantic content;
3. turn-taking structure;
4. relative acoustic change;
5. absolute acoustic value.

An absolute acoustic value never overrides a clear semantic outcome.
# 12. Response Quality Dimensions

## 12.0 The scale

```yaml
id: dim_00
type: dimension
priority: high
related: [obj_03, ev_02]
```

Six dimensions are scored on a five-band scale. The bands are defined by
distance from the dimension's stated ceiling, not by impression.

| Band | Meaning |
|---|---|
| 5 | The ceiling was met in full. |
| 4 | The ceiling was met except for one named component. |
| 3 | The behaviour was present and functional; a named component was absent. |
| 2 | The behaviour was attempted and did not function. |
| 1 | The behaviour was absent where the situation called for it. |
| `not_assessed` | Out of scope for the selected duration (§13), or insufficient evidence. |

**Three binding rules.**

1. **Every band above 1 requires quotable evidence** (`ev_02`). A dimension
   with no quotable evidence returns `not_assessed`, never a low score.
   Absence of evidence is not evidence of absence.
2. **A named component means named in the report.** Bands 3 and 4 state which
   component was missing, in words, with the relevant turn quoted.
3. **One behaviour, one dimension** (`obj_03`). A single flaw may set the band
   for its primary dimension only.

## 12.1 Ceilings

```yaml
id: dim_01
type: dimension
priority: high
related: [dim_00, dir_03]
```

A dimension without a stated ceiling cannot be scored 5, and its bar becomes
decorative. Each ceiling below is a single behavioural standard, identical for
every user. **Direction does not change the ceiling; it changes what is
credited on the way to it and what is flagged** (`dir_03`).

### `clarity`
**Ceiling.** The user's position, request or commitment is stated in terms the
counterpart could act on without further clarification — specific enough that a
date, an owner, or a concrete action is identifiable where the situation calls
for one.
**Primary for:** vagueness; unstated commitments; unresolvable references.
**Never fed by:** `speaking_rate`, `filler_candidates`, `response_latency`
(`safety_04`).

### `assertiveness`
**Ceiling.** The position was stated plainly; it survived at least one challenge
unchanged in substance; and the counterpart's concern was acknowledged at least
once, without characterising them.

The ceiling has two halves deliberately, and neither direction gets it free.
An under-assertive user typically fails on *survived a challenge*; an
over-assertive user typically fails on *acknowledged the concern*. Both have
something to earn.

**Not the same as:** aggression, dominance, certainty, volume, or refusal to
compromise. A user who changes position because they were persuaded has not
lost assertiveness — a position changed on argument is not a position withdrawn
under pressure, and the transcript distinguishes them.
**Primary for:** position absent, withdrawn, or never surviving challenge.

### `acknowledgment`
**Ceiling.** At least one acknowledgment that named something the counterpart
actually said, in their terms, that did not concede a point the user disputes,
and that was referred back to at least once if the exchange continued.
**Primary for:** generic acknowledgment; acknowledgment that concedes; absent
acknowledgment before disagreement in a mitigated (`indirect` key) register.

### `non_escalation`
**Ceiling.** Across the session, the counterpart was never characterised, their
motives were never attributed, and where the counterpart escalated, the user's
following turn did not match the escalation.
**Primary for:** personal characterisation; motive attribution; escalation
matching.
**Note.** Non-escalation is not agreeableness. A firm refusal, a flat
disagreement and a stated boundary are all fully compatible with a 5 here.

### `target_technique`
**Ceiling.** The scenario's declared target tool was used at its own ceiling, as
that tool defines it in §7.
**Not scored at all** where the scenario declares no target technique, or where
the user reached the objective by other means (`tool_00`) — it returns
`not_assessed`, not a low band.

### `effectiveness`
**Ceiling.** `objective_progress: full` (`obj_02`).
This dimension is objective progress and nothing else. It is not a judgement of
how well the user spoke, and no stylistic observation may move it.

## 12.2 Self-report is not a score

```yaml
id: dim_02
type: dimension
priority: high
```

The user's own answer to how prepared they feel is stored, displayed, and
**never feeds any dimension, any trend, or any inferred variable** — including
`user_direction`.

It may be shown alongside the dimensions for the user's own reference, and a
persistent gap between self-report and objective progress may be surfaced to
the user as an observation about their own calibration. It is never used as
evidence about them (`safety_03`).

---


## 12.3 Contextual calibration is not a seventh score

```yaml
id: dim_03
type: dimension_rule
priority: high
```

There is no `cultural_fitness` or `canadian_ness` / `american_ness` indicator.

Country, domain, relationship and register can change whether a behaviour satisfies an
existing ceiling - for example, whether acknowledgment was needed for calibrated
assertiveness in this scenario - but they do not create a separate moral or cultural score.

The report may show a short **Context fit** narrative note where §4 identified a material
country/context mismatch. If no material mismatch affected the exchange, the note is
omitted.
# 13. Session Scope and Duration Rules

## 13.0 Duration determines what may be scored

```yaml
id: dur_00
type: interpretation_rule
priority: high
related: [obj_05, dim_00]
```

Practice runs at 120, 180 or 300 seconds. A playbook sequence that cannot
complete in the selected duration must not be scored as incomplete.

| Duration | Phases in scope | Dimensions assessed |
|---|---|---|
| 120 s | Regulate · understand · clarify | `clarity`, `acknowledgment`, `non_escalation`, `target_technique` |
| 180 s | + acknowledge validity, state position or boundary | + `assertiveness` |
| 300 s | + responsibility, correction, concrete next step | + `effectiveness` at full objective scope |

**Binding rules.**

1. A phase outside the selected duration returns `not_assessed_out_of_scope`
   for every dimension that depends on it. It is never a low band.
2. The report states which phases the selected length did not cover.
3. **A user who selects 120 seconds must be able to reach band 5** on every
   dimension that is in scope at that length. A duration in which the ceiling
   is unreachable is a defect.
4. `effectiveness` at 120 and 180 seconds is assessed against the reduced
   `full_success` scope the scenario declares for that duration (`obj_05`),
   not against the 300-second scope.
5. A playbook may override this table where its own structure differs —
   `pb_boundary_violation` is scoreable in full at 120 seconds, because the
   limit and one repeat ask fit.

---
# 14. Feedback Rules

## 14.0 What feedback must answer

```yaml
id: fb_00
type: feedback_rule
priority: high
```

Every piece of feedback answers three questions in order: **what happened**,
**why it mattered in this situation**, and **what could be tried instead**.
Feedback that answers fewer than three is incomplete; text that answers none is
removed.

Ten binding rules:

1. Start from observable, quotable evidence (`ev_02`).
2. Explain why it mattered **in this context** — not in general.
3. Do not overstate certainty; carry the confidence level through into the
   wording (`ev_05`, `ev_06`).
4. Distinguish what worked from what could be improved, and give both.
5. Give specific alternatives, as illustrations rather than as the correct
   phrasing (`definition_of_good`).
6. Do not reward verbosity. Length is not a quality.
7. Do not demand one correct phrase.
8. Preserve the user's own style (`translation_not_fabrication`).
9. Do not infer emotion, personality or intent (`safety_03`).
10. Prefer one or two high-value improvements over many small corrections.

## 14.1 Report structure

```yaml
id: fb_01
type: feedback_rule
priority: high
related: [obj_02]
```

Fixed order:

1. **The objective and whether it was reached** (`obj_02`).
2. What worked, with quotes.
3. At most two improvements, with quotes and alternatives.
4. The dimension indicators.
5. Next practice focus — one item.
6. Self-report prompt (`dim_02`).

The objective precedes the indicators. A report opening with six partial bars
reads as a verdict on the person; a report opening with what was achieved reads
as information.

## 14.2 Quantity limits

```yaml
id: fb_02
type: feedback_rule
priority: high
```

- At most **two** improvement items per report, however many the evidence
  supports. The rest are held for later sessions.
- At most **one** next-practice focus.
- Every improvement item carries a quote and at least one concrete alternative.
- No report contains more claims than it has quotable evidence for (`ev_02`).

**Rationale.** A report listing six improvements is not more useful than one
listing two; it is less useful, because nothing is prioritised and the reader
concludes the whole attempt failed.

## 14.3 One direction per report

```yaml
id: fb_03
type: feedback_rule
priority: high
related: [dir_04]
```

A single report never contains both "be clearer or more direct" and "soften
your delivery." Where the evidence supports both, the report carries the one
that weighed more for this situation's objective and is silent on the other,
which may be raised in a later session on a different scenario.

This restates `dir_04` inside the feedback layer because it is enforced at the
point where report text is generated.

## 14.4 Framing rules

```yaml
id: fb_04
type: feedback_rule
priority: high
related: [safety_03, dir_08]
```

1. Every dimension comment describes **behaviour in this exchange**, never a
   property of the user. "The position was stated once and then dropped", never
   "you tend to back down."
2. `user_direction` is never displayed as a label, type or badge (`dir_08`).
3. No comparison to other users, ever.
4. A red line crossed is stated once, plainly, without being softened by
   surrounding positives and without being repeated (`obj_04`).
5. Where a signal is reported, the report gives the measurement and the
   quoted turn, not an adjective about how the user sounded.

## 14.5 Comparability

```yaml
id: fb_05
type: feedback_rule
priority: high
```

A numeric delta between attempts is shown **only** where the prior attempt
matches on all of: `scenario_id`, `duration`, `mode`, counterpart difficulty,
and `manual_version`.

- Same `context_type`, different scenario → qualitative comparison only, with
  the difference stated.
- Different `manual_version` → no delta; the report notes that the methodology
  changed.
- Guided and realistic modes are never compared to each other (`cp_06`).
- Fewer than three comparable attempts → no trend language. Single-attempt
  observations only.

## 14.6 Feedback in out-of-scope sessions

```yaml
id: fb_06
type: feedback_rule
priority: high
related: [safety_02]
```

Where `safety_02` applies — that is, in the out-of-scope situations listed in
`safety_01` — none of the rules in this section produce a normal report. The
session is not scored, no dimensions are shown, no trend is stored, and the
report consists solely of the boundary statement specified in `safety_02`.

---


## 14.7 Country-specific feedback rule

```yaml
id: fb_07
type: feedback_rule
priority: high
related: [reg_04, dim_03]
```

Mention Canada/USA only when the country contrast materially explains why an otherwise
reasonable behaviour worked differently in this scenario.

Country feedback must:

1. name the behaviour, not a stereotype;
2. state that the alternative preserves the user's intent;
3. avoid "Canadians are..." / "Americans are..." claims;
4. never override stronger scenario or counterpart evidence;
5. give one concrete alternative, not a cultural lecture.

Example:

> "Your refusal was clear. In this Canadian peer scenario, adding the real alternative
> you had available would likely preserve cooperation without weakening the boundary."

Not:

> "Canadians expect you to be less direct."
# 15. Examples and Validation Suite

## 15.0 Activation gate

```yaml
id: val_00
type: principle
priority: high
```

A Manual version activates only after the evaluator reproduces the expected outputs in the
validation suite, or the change log documents an intentional expectation change.

Lifecycle: Upload -> Parse -> Preview -> Validate -> Activate -> Rollback.

**Important:** written examples test internal consistency, not empirical realism. Real
transcripts supersede synthetic examples when enough comparable data exists.

This Manual's validation must include, at minimum:

- both evaluation markets;
- workplace and personal domains;
- L2/unknown language background cases;
- at least one case where the same wording is acceptable in both markets;
- at least one case where country changes the recommended form but not the score;
- at least one case where country changes an existing dimension because the mismatch
  actually affected reception or objective progress;
- safety override;
- uncertainty outcome;
- productive repair.

## 15.1 Core suite

```yaml
id: val_01
type: example
priority: high
```

```yaml
- example_id: ex_001
  rule_ids: [sig_response_latency, tool_response_pause, ev_06]
  evaluation_market: usa
  context_type: aggression
  register: balanced
  fragment: >
    Counterpart: "You clearly don't care whether the team succeeds."
    [pause] User: "What happened that made you come to that conclusion?"
  expected_interpretation: pause_followed_by_complete_clarification
  expected_confidence: medium
  must_not_conclude: [nervousness, strategic_control_as_fact]

- example_id: ex_002
  rule_ids: [sig_response_latency, ev_06]
  evaluation_market: canada
  context_type: aggression
  register: balanced
  fragment: >
    Counterpart: same statement.
    [same measured pause] User: "I mean - that's - I do care, I've been - look..."
  expected_interpretation: uncertain
  expected_confidence: uncertain
  note: same timing, different following response; timing alone cannot decide function

- example_id: ex_003
  rule_ids: [sig_apology_type, reg_apology]
  evaluation_market: canada
  context_type: meeting_open
  fragment: 'User: "Sorry - can I squeeze past you?"'
  expected_classification: ritual
  expected_evaluation: neutral_or_positive
  must_not_conclude: [guilt, low_status, false_responsibility]

- example_id: ex_004
  rule_ids: [sig_apology_type, reg_apology]
  evaluation_market: usa
  context_type: upset_person
  fragment: 'User: "Sorry you feel that way."'
  expected_classification: pseudo
  expected_evaluation: works_against_objective
  note: same in both markets

- example_id: ex_005
  rule_ids: [tool_acknowledgment, ctx_criticism_unfair]
  evaluation_market: canada
  context_type: criticism_unfair
  fragment: >
    User: "I can see why the delay is frustrating. I want to separate one point:
    I wasn't the owner of the vendor approval."
  expected_interpretation: acknowledgment_plus_false_premise_correction
  must_not_conclude: [admission_of_fault]

- example_id: ex_006
  rule_ids: [reg_position]
  evaluation_market: usa
  context_type: disagreement
  register: direct
  fragment: >
    User: "I don't think that timeline is workable. The testing dependency is still open."
  expected_evaluation: calibrated_explicit_position

- example_id: ex_007
  rule_ids: [reg_position]
  evaluation_market: canada
  context_type: disagreement
  register: balanced
  fragment: >
    User: "I see why Friday is attractive. I don't think that timeline is workable
    with the testing dependency still open."
  expected_evaluation: calibrated_explicit_position

- example_id: ex_008
  rule_ids: [reg_position, reg_04]
  evaluation_market: canada
  context_type: disagreement
  register: balanced
  fragment: >
    User: "I don't think that timeline is workable. The testing dependency is still open."
  expected_evaluation: effective_unless_scenario_evidence_shows_relational_cost
  note: country difference must not create an automatic deduction

- example_id: ex_009
  rule_ids: [reg_refusal, tool_boundary_statement]
  evaluation_market: canada
  context_type: boundary_violation
  fragment: >
    Counterpart asks for Friday delivery twice.
    User: "I can't add that by Friday. I can take it Monday, or we can move X."
  expected_evaluation: boundary_survives_with_real_alternative

- example_id: ex_010
  rule_ids: [reg_refusal, tool_boundary_statement]
  evaluation_market: usa
  context_type: boundary_violation
  fragment: >
    Counterpart asks for Friday delivery twice.
    User: "I can't add that by Friday. Monday is available."
  expected_evaluation: boundary_survives

- example_id: ex_011
  rule_ids: [tool_impact_self_advocacy, reg_credit]
  evaluation_market: usa
  context_type: self_advocacy
  fragment: >
    User: "I led the QA redesign, which reduced regression time by 30%.
    I'd like to lead the next phase."
  expected_evaluation: visible_ownership_plus_impact_plus_ask

- example_id: ex_012
  rule_ids: [tool_impact_self_advocacy, reg_credit]
  evaluation_market: canada
  context_type: self_advocacy
  fragment: >
    User: "The team reduced regression time by 30%; I led the QA redesign that drove
    that change. I'd like to lead the next phase."
  expected_evaluation: visible_ownership_plus_team_context_plus_ask

- example_id: ex_013
  rule_ids: [tool_impact_self_advocacy, reg_credit]
  evaluation_market: canada
  context_type: receiving_positive_feedback
  fragment: >
    User: "Honestly, it was really the team. I didn't do much."
  expected_finding: credit_erased
  must_not_report_as: canadian_modesty

- example_id: ex_014
  rule_ids: [reg_questions, tool_open_questions]
  evaluation_market: canada
  context_type: soft_no
  fragment: >
    User: "Would it help if I came back in two weeks, or is this not a direction
    you want to pursue?"
  expected_evaluation: exit_permitting_question_surfaces_answer

- example_id: ex_015
  rule_ids: [reg_questions, tool_open_questions]
  evaluation_market: usa
  context_type: disagreement
  fragment: >
    User asks six questions across the session and never states their own position.
  expected_finding: questioning_substituted_for_position
  must_not_conclude: [low_confidence, conflict_avoidant_trait]

- example_id: ex_016
  rule_ids: [tool_repair_reset]
  evaluation_market: usa
  context_type: disagreement
  fragment: >
    User: "That's a ridiculous plan - sorry, that was about the plan, not you.
    Let me restart: I disagree because the dependency isn't closed."
  expected_evaluation: attack_not_ignored_but_productive_repair_credited

- example_id: ex_017
  rule_ids: [tool_response_pause, reg_pause]
  evaluation_market: usa
  context_type: upset_person
  domain: personal
  fragment: >
    Counterpart describes a painful event. User remains silent briefly, then says,
    "That sounds like it was a very lonely moment."
  expected_evaluation: empathic_pause_not_penalised_as_floor_loss

- example_id: ex_018
  rule_ids: [safety_01, safety_02, fb_06]
  evaluation_market: canada
  context_type: any
  fragment: >
    User describes a manager repeatedly making sexual comments about their appearance.
  expected_behaviour:
    - no_dimension_scores
    - no_trend_stored
    - boundary_statement_only_per_safety_rule
  must_not_produce:
    - de_escalation_as_remedy
    - acknowledgment_as_remedy
    - responsibility_acceptance_coaching

- example_id: ex_019
  rule_ids: [safety_04, sig_speaking_rate, sig_filler_candidates]
  language_background: L2
  context_type: self_advocacy
  fragment: >
    User has several fillers and a slower rate but states contribution, impact and ask clearly.
  expected_dimensions:
    clarity: unaffected_by_rate_or_fillers
    assertiveness: unaffected_by_rate_or_fillers
  must_not_conclude: [low_confidence, low_competence, poor_english]

- example_id: ex_020
  rule_ids: [reg_04, fb_07]
  evaluation_market: canada
  context_type: disagreement
  fragment: >
    User gives a concise direct disagreement. Counterpart accepts it and continues
    constructively with no relational shift.
  expected_behaviour:
    - no_country_specific_correction
    - do_not_rewrite_into_more_canadian_form
  note: country baseline is not a mandatory stylistic template
```

---

## 15.2 Personal-domain validation suite

```yaml
id: val_personal_01
type: example
priority: high
related: [val_01, dom_00]
```

The six examples below (`pex_001`–`pex_006`) are this block's content, exactly as
`val_01`'s examples are its own — this heading previously had no `id`-bearing block of its
own, meaning the personal-domain suite could not be retrieved as a unit under `ret_01`'s own
retrieval contract. No example content, expected interpretation, expected evaluation, or
`must_not_*` field below has been altered.

```yaml
- example_id: pex_001
  rule_ids: [dom_objective_type, pb_emotional_disclosure, sig_response_latency]
  context_type: emotional_disclosure
  domain: personal
  evaluation_market: canada
  fragment: >
    Counterpart: "I've been scared about this for weeks and I didn't know how to tell you."
    [2.4 s] User: "I didn't realise you'd been carrying that by yourself."
  expected_interpretation: silence_followed_by_specific_reception
  expected_evaluation: serves_relational_objective
  must_not_conclude: [hesitation, loss_of_floor, canada_pause_rule]

- example_id: pex_002
  rule_ids: [dom_tool_calibration, pb_emotional_disclosure]
  context_type: emotional_disclosure
  domain: personal
  fragment: >
    Counterpart: "I feel completely overwhelmed at work."
    User: "You should tell your manager to move the deadline."
  expected_classification: solving_before_hearing
  expected_primary_dimension: acknowledgment
  must_not_conclude: [uncaring_personality, low_empathy_trait]

- example_id: pex_003
  rule_ids: [ctx_raising_personal_issue, pb_raise_personal_issue]
  context_type: raising_personal_issue
  domain: personal
  fragment: >
    User: "The last three weekends we changed our plans after your family called.
    I want us to decide our weekend plans together before we say yes to anyone else."
  expected_interpretation: observable_pattern_plus_clear_request
  expected_evaluation: minimum_success_met
  must_not_require: [counterpart_agreement, apology]

- example_id: pex_004
  rule_ids: [ctx_receiving_hurt_disappointment, pb_receive_hurt]
  context_type: receiving_hurt_disappointment
  domain: personal
  fragment: >
    Counterpart: "It hurt that you didn't call after you said you would."
    User: "You're right that I said I'd call and I didn't. I can see why that landed badly."
  expected_interpretation: impact_received_plus_fair_responsibility
  expected_evaluation: relational_progress
  must_not_require: [instant_forgiveness, resolution]

- example_id: pex_005
  rule_ids: [ctx_recurring_conflict, pb_recurring_conflict, dom_dimensions]
  context_type: recurring_conflict
  domain: personal
  fragment: >
    User: "We're starting the same argument again. I don't want to prove the grocery list
    one more time. Can we figure out what keeps happening between us when this comes up?"
  expected_interpretation: pattern_named_instead_of_re_litigated
  expected_evaluation: serves_mixed_objective

- example_id: pex_006
  rule_ids: [ctx_family_obligation, pb_family_boundary, safety_01, dom_safety]
  context_type: family_obligation
  domain: personal
  fragment: >
    User holds a clear limit through two guilt-based requests with no threat or coercive control.
  expected_behaviour:
    - standard_scoring_allowed
    - boundary_measured_at_repeat_ask
  note: >
    Emotional pressure alone is not automatically classified as abuse. If threats, coercive
    control, or safety-relevant repeated overriding enter the scene, standard scoring stops.
```

These examples test personal-domain routing, relational success, solving-versus-hearing,
responsibility, recurring-conflict meta-communication, and the boundary between difficult family
pressure and out-of-scope coercion.

## 15.3 Empirical validation threshold

```yaml
id: val_02
type: validation_rule
priority: high
```

Before any country-specific acoustic threshold or numeric weighting is introduced, the
product must have enough real, consented, comparable sessions to estimate whether the
pattern is stable across:

- both markets;
- L1 and L2 speakers;
- multiple sectors;
- at least two relationship/power configurations;
- more than one scenario of the same context.

Until then, country differences remain rule-based and qualitative. Apparent patterns in a
small convenience sample do not become cultural facts.
# 16. Domain Layer: Personal and Relational Communication

## 16.0 The domain variable

```yaml
id: dom_00
type: principle
priority: high
```

Personal communication is a **first-class domain**, not a softened version of workplace
communication. The evidence rules, uncertainty rules, safety limits, authenticity stance, and core
communication tools still apply. What changes is the objective structure, relative weight of country
calibration, relationship dynamics, counterpart behaviour, and which quality dimensions are relevant.

Every scenario declares:

```yaml
domain: workplace | personal | mixed | networking | public
```

`mixed` covers situations such as a family business, co-parenting logistics with an ex-partner, or a
friend who is also a colleague. The scenario declares which domain governs the objective and which
setting governs any institutional norm.

---

## 16.1 Objective type

```yaml
id: dom_objective_type
type: principle
priority: high
related: [obj_00, obj_02]
```

Every scenario also declares:

```yaml
objective_type: instrumental | relational | mixed
```

**Instrumental.** Success depends on an external result the user can reasonably influence: obtain
information, state a boundary, make a request, reach a decision, clarify a responsibility, or secure
a commitment.

**Relational.** Success depends on what happens inside the exchange: the issue becomes discussable,
the counterpart's experience is received, the user's experience becomes clear, or access to the
relationship/topic is restored. **Agreement, forgiveness, resolution, apology, or behaviour change
from the other person are never required for full success.**

**Mixed.** Both matter. The scenario declares which comes first. In many personal conflicts the
relational objective is a prerequisite for the instrumental one; in a safety or hard-boundary scene,
the boundary may take priority.

A personal scenario with a hidden instrumental target disguised as a relational conversation is
invalid. Example: a partner's painful disclosure must not secretly be scored on whether the user got
them to agree to a plan.

---

## 16.2 Relational success conditions

```yaml
id: dom_relational_success
type: interpretation_rule
priority: high
related: [obj_02, obj_04]
```

Relational success is evaluated only from observable transcript evidence. Permitted building blocks
include:

| Relational condition | Observable evidence |
|---|---|
| The counterpart's experience was received | specific acknowledgment or accurate reflection of what they said |
| The counterpart had room to continue | user yielded the floor; counterpart added information or continued voluntarily |
| The user stated their own need/experience | first-person, recoverable statement without motive attribution |
| The topic remained discussable | no user-driven unilateral close, contemptuous attack, or forced resolution |
| Repair was attempted specifically | user named a concrete action/utterance rather than a global self-judgment |
| A boundary remained intact | substantive limit did not disappear under repeat pressure |

**Not permitted as user success conditions:** the counterpart agrees, calms down, forgives,
apologises, changes their mind, or behaves differently later. Those outcomes may occur in a
simulation, but they are not the user's score.

A simulated counterpart's response is evidence about whether a conversational move had an effect in
the scene; it is not proof about how a real partner, friend, or relative would respond.

---

## 16.3 Country calibration in the personal domain

```yaml
id: dom_country_calibration
type: interpretation_rule
priority: high
related: [reg_03, reg_domain]
```

`evaluation_market: canada | usa` remains mandatory because the application explicitly lets the user
choose which environment they are practising for. **Its weight is lower in established personal
relationships than in professional settings.**

Precedence for `domain: personal`:

1. scenario-declared relationship pattern and counterpart style;
2. observed behaviour in this exchange;
3. relationship history / familiarity;
4. family or household norms specified by the scenario;
5. power or role relation (partner, friend, parent, adult child, co-parent);
6. evaluation market as a weak baseline where a country contrast is actually relevant.

In a close relationship there is no single authoritative "room style." Two people may have different
interaction norms. The evaluator reports the mismatch symmetrically rather than treating one person
as culturally correct.

Country may affect wording suggestions or interpretation when evidence supports a meaningful
contrast, but never produces a personal-domain deduction on its own.

---

## 16.4 Counterpart behaviour in the personal domain

```yaml
id: dom_counterpart
type: counterpart_rule
priority: high
related: [cp_02, cp_03, cp_04, cp_05]
```

Personal counterparts remain realistic and stay in character. They are not reward machines for
technique use.

**Movement conditions.** A personal scenario may declare conditions that make deeper engagement,
clarification, or de-escalation *available*. Meeting a condition does **not require** the counterpart
to soften, agree, forgive, or become calm. The counterpart may remain upset while showing that the
message was received.

**Escalation.** High escalation may appear as pressure, repetition, sharpness, withdrawal, clipped
responses, `fine, forget it`, or ending the exchange. Loudness is not required. Withdrawal is not
always hostility; the scenario specifies its function.

**Information discovery.** In personal scenes, the counterpart may not fully know what is wrong at
the opening. Some information can emerge through good questions or acknowledgment rather than being
pre-stored and deliberately withheld.

**Silence.** The AI does not deploy punitive silent treatment as a generic pressure test. Natural
silence and withdrawal may occur where the scenario specifies them, but the app does not teach the
user to endure punishment as a communication skill.

The anti-sycophancy rule remains: generic niceness, apology, warmth, or effort never automatically
resolves the scene.

---

## 16.5 Tool calibration for personal communication

```yaml
id: dom_tool_calibration
type: interpretation_rule
priority: high
related: [tool_response_pause, tool_acknowledgment, tool_labeling,
          tool_open_questions, tool_fact_vs_story, tool_boundary_statement,
          tool_clear_request, tool_repair_reset]
```

The same tools remain available, but their function changes with the relational objective.

| Tool | Personal-domain calibration |
|---|---|
| `response_pause` | Silence can function as reception after painful material. It is neither automatically good nor bad; evaluate what followed and whether the floor was available to the counterpart. |
| `acknowledgment` | Often needs to receive the **experience/impact**, not only repeat the factual content. Specificity matters more than formula. |
| `labeling` | Use tentatively only when the counterpart has not already named the state/concern. It is not a licence to tell someone what they feel. |
| `open_questions` | One genuine question can deepen understanding; serial questions can become interrogation. `why` is evaluated by function, not banned as a word. |
| `fact_vs_story` | Especially useful before raising recurring grievances: separate what happened from global conclusions about love, respect, selfishness, or intent. |
| `boundary_statement` | Still must be recoverable and survive pressure. Relational warmth cannot substitute for an actual limit. |
| `clear_request` | Requests should make the desired behaviour clear without turning preference into moral obligation. |
| `repair_reset` | High-value in personal communication: correct wording, restart tone, own a specific miss, or return after withdrawal without pretending nothing happened. |

**Solving instead of hearing.** In a relational scene, a solution offered before any reception of a
painful disclosure is a sequencing finding. It is primary to `acknowledgment`, not a personality or
empathy judgment. A solution after acknowledgment may be excellent if it is wanted.

**Matching stories.** Sharing a similar personal experience is not automatically poor empathy. It is
less effective when it captures the floor before the counterpart's experience was received; it can
be connecting when brief and returned to the counterpart.

---

## 16.6 Dimensions in the personal domain

```yaml
id: dom_dimensions
type: dimension
priority: high
related: [dim_01, obj_02]
```

The six core dimensions remain, but not all are assessed in every relational scenario.

**`effectiveness`.** Always equals objective progress. For relational objectives, it uses
`dom_relational_success`, never counterpart agreement or resolution.

**`assertiveness`.** Returns `not_assessed` where no position, need, request, or boundary is called
for (for example, receiving a disclosure). Where a position or need is relevant, the ordinary
ceiling applies with context-sensitive challenge requirements.

**`acknowledgment`.** May be satisfied by receiving impact/experience, not only factual content.
Silence alone does not automatically satisfy it; silence plus the surrounding exchange may.

**`non_escalation`.** In personal scenes, the following are additional observable escalation moves:
- globalisation (`always`, `never`) when used as a global character/pattern claim rather than literal frequency;
- history-widening: importing unrelated earlier grievances into the current issue;
- counter-grievance: answering one complaint with a different complaint instead of first receiving it;
- contemptuous characterisation or motive attribution, already prohibited in the core rules.

These are evaluated by function and context. The words `always` and `never` are not banned tokens.

---

## 16.7 Duration in the personal domain

```yaml
id: dom_duration
type: interpretation_rule
priority: high
related: [dur_00, obj_05]
```

Relational practice should not pretend a two-minute fragment represents full relationship repair.

- `emotional_disclosure` and `repair_after_rupture`: minimum normal variant 180 seconds.
- `recurring_conflict`: 180 or 300 seconds preferred; a 120-second micro-practice may train only the
  pattern-naming opening and is labelled as such.
- boundary and clear-request drills may be fully scoreable at 120 seconds where the objective fits.

Every duration has its own reachable `full_success`. A shorter session never receives a low score for
phases it was not designed to contain.

---

## 16.8 Safety in the personal domain

```yaml
id: dom_safety
type: safety_rule
priority: high
related: [safety_01, safety_02, safety_03]
```

1. **The app trains the user's own communication, not control of another person.** No tool is framed
   as a reliable way to make a partner, parent, friend, ex-partner, or child comply, forgive, calm
   down, or change.
2. **The app does not assess the relationship or the absent third party.** It does not tell the user
   that a relationship is healthy/unhealthy, that a partner is narcissistic, avoidant, manipulative,
   toxic, or any other trait label. It evaluates only the exchange available to it.
3. **Safety overrides skill coaching.** Threats, stalking, intimate partner abuse, coercive control,
   or immediate danger trigger the core safety rules and standard scoring stops.
4. **Repeated limits require contextual care.** Repetition of a difficult request is not, by itself,
   proof of coercive control. The app does not infer abuse from ordinary conflict. Where scenario or
   user content contains explicit safety indicators, the safety route applies.
5. **Children.** The app may train communication with one's child, but does not judge parenting
   decisions, developmental diagnoses, or whether the underlying rule/limit is appropriate. It
   evaluates only the user's communication within the scenario.

---

# 17. Relational Context Taxonomy

## 17.0 Scope

```yaml
id: rctx_00
type: principle
priority: high
related: [ctx_00, dom_00]
```

The shared contexts in §6 — criticism, disagreement, boundary violation, aggression, difficult
request, upset person, and repair — can occur in personal relationships. This section adds personal
contexts where the objective or counterpart mechanics differ enough that a dedicated context prevents
professional rules from misfiring.

---

## 17.1 Context: Raise a difficult personal issue / unmet need

```yaml
id: ctx_raising_personal_issue
type: context
context_id: raising_personal_issue
domain: personal
objective_type: mixed
priority: high
tools: [fact_vs_story, clear_request, acknowledgment, open_questions]
```

**Definition.** The user needs to raise something that is bothering them, missing in the relationship,
or repeatedly not working: attention, household load, communication style, plans, intimacy of
connection, support, time, reliability, or another ordinary relational need.

**Primary objectives.** Make the issue discussable; state the user's experience/need without a global
judgment of the other person; and make one clear request if the exchange is ready for it.

**Common risks.** Waiting until anger is already high; opening with characterisation; presenting a
long prosecution before naming the need; using a question to hide an accusation; vague hints that the
counterpart cannot act on; or demanding agreement about motives before discussing behaviour.

**Success does not require agreement.** Full relational success can occur when the need and issue are
clear and the conversation remains usable even if the counterpart sees the situation differently.

---

## 17.2 Context: Receive hurt or disappointment

```yaml
id: ctx_receiving_hurt_disappointment
type: context
context_id: receiving_hurt_disappointment
domain: personal
objective_type: relational
priority: high
tools: [response_pause, acknowledgment, open_questions, fair_responsibility,
        false_premise_correction]
```

**Definition.** Someone close tells the user that something the user did, did not do, or said hurt,
disappointed, embarrassed, or let them down. The statement may contain accurate facts, interpretation,
or both.

**Primary objectives.** Understand what landed badly; receive the impact without automatically
accepting every interpretation; take responsibility for the valid part; preserve room for the user's
own perspective later.

**Common risks.** Immediate intent defence; counter-grievance; debating whether the other person is
allowed to feel hurt; false responsibility; apology as a shutdown; or correcting factual details
before the main impact has been received.

**Key distinction.** `I didn't mean that` and `that didn't affect you` are different claims. Intent can
be clarified without invalidating impact.

---

## 17.3 Context: Receiving an emotional disclosure

```yaml
id: ctx_emotional_disclosure
type: context
context_id: emotional_disclosure
domain: personal
objective_type: relational
min_duration: 180
priority: high
tools: [response_pause, acknowledgment, labeling, open_questions]
```

**Definition.** Someone close shares distress, grief, fear, shame, uncertainty, or another personally
important experience. They may not be asking for a solution.

**Primary objectives.** Receive the disclosure; make space for continuation if wanted; avoid forcing
solution, reassurance, diagnosis, or closure.

**Common risks.** Solving before hearing; matching the story and taking the floor; premature
reassurance; interrogation; relabelling an emotion the person already named; or treating silence as a
failure that must be filled.

**Pause rule.** A pause can be an effective form of reception. It is never declared the "best"
response from duration alone. Evaluate what came before, what followed, and whether the counterpart
had room to continue.

---

## 17.4 Context: Recurring conflict

```yaml
id: ctx_recurring_conflict
type: context
context_id: recurring_conflict
domain: personal
objective_type: mixed
priority: high
tools: [repair_reset, acknowledgment, open_questions, fact_vs_story]
```

**Definition.** The same disagreement has happened enough times that both people know the usual
arguments. The interaction pattern is now part of the problem.

**Primary objectives.** Notice and name the cycle; avoid automatically performing the usual role;
understand what keeps the cycle alive; change one element or leave with a more accurate map of the
pattern.

**Common risks.** Re-litigating old evidence; anticipating and rebutting lines not yet spoken;
history-widening; counter-grievance; global character claims; or assuming that a more persuasive
version of the same argument is progress.

---

## 17.5 Context: Repair after a rupture

```yaml
id: ctx_repair_after_rupture
type: context
context_id: repair_after_rupture
domain: personal
objective_type: relational
min_duration: 180
priority: high
tools: [repair_reset, acknowledgment, fair_responsibility, response_pause]
```

**Definition.** Returning after an argument, withdrawal, badly handled conversation, or other rupture
where the relationship/topic has become harder to access.

**Primary objectives.** Reopen contact; name the user's own part specifically where appropriate; make
the topic discussable again.

**Not required.** Resolution, reciprocal apology, forgiveness, or agreement.

**Common risks.** Reopening with the case for why the user was right; apology with an attached demand;
`I'm sorry you...`; global self-condemnation instead of specific responsibility; or treating the
counterpart's remaining upset as proof the repair failed.

---

## 17.6 Context: Unequal investment / shared load

```yaml
id: ctx_unequal_investment
type: context
context_id: unequal_investment
domain: personal
objective_type: mixed
priority: high
tools: [fact_vs_story, clear_request, acknowledgment, open_questions]
```

**Definition.** One person experiences themselves as carrying more of a recurring shared load:
household tasks, planning, emotional labour, caregiving, remembering, social coordination, or another
ongoing responsibility.

**Primary objectives.** Make the lived imbalance visible without reducing the relationship to a
ledger; establish whether both people see the same problem; make one concrete request or test one
change if possible.

**Common risks.** Itemised prosecution before stating the underlying experience; `you never`; debating
one counterexample as though it settles the pattern; a vague request to `help more`; or accepting a
one-off gesture as if it resolves an ongoing system.

**Observable rule.** Examples are useful evidence; they become less useful when the exchange gets
trapped in proving the exact count rather than clarifying the pattern and desired change.

---

## 17.7 Context: Family obligation / relational boundary

```yaml
id: ctx_family_obligation
type: context
context_id: family_obligation
domain: personal
objective_type: mixed
priority: high
tools: [boundary_statement, graceful_repetition, acknowledgment, response_pause]
```

**Definition.** A family request involving time, money, hosting, caregiving, presence, tradition, or
another obligation that the user cannot or does not want to meet.

**Primary objectives.** State the limit; acknowledge relational impact without withdrawing it; hold
the limit through ordinary emotional pressure; avoid unsustainable substitute commitments.

**Common risks.** Justification that becomes a debate; false reason; over-compensation; arguing about
whether declining means not caring; or treating guilt-based disappointment as something the user must
eliminate before the boundary counts.

**Safety distinction.** Ordinary family pressure can be difficult without being coercive control. The
app does not infer abuse from intensity alone. Explicit safety indicators route to §2/§16.8.

---

## 17.8 Context: Limit with a child

```yaml
id: ctx_parent_child_limit
type: context
context_id: parent_child_limit
domain: personal
objective_type: mixed
priority: medium
tools: [response_pause, acknowledgment, boundary_statement, graceful_repetition]
```

**Definition.** The user is holding a limit with their own child, minor or adult, and the child pushes
back.

**Primary objectives.** Keep the limit clear where that is the scenario's given premise; acknowledge
the child's experience; avoid making agreement a requirement for connection.

**Common risks.** Re-explaining until the limit becomes a negotiation; matching escalation; using
withdrawal of warmth as enforcement; or withdrawing the limit solely to stop distress.

**Prohibited evaluation.** The app does not judge whether the parenting decision itself is correct,
diagnose the child, or infer what the child's behaviour means. It evaluates only communication.

---

## 17.9 Context: Ask for emotional or practical support

```yaml
id: ctx_asking_for_support
type: context
context_id: asking_for_support
domain: personal
objective_type: mixed
priority: high
tools: [clear_request, fact_vs_story, acknowledgment]
```

**Definition.** The user wants support from someone close but the desired support has not been stated
clearly or prior attempts have produced mismatch (advice when listening was wanted, reassurance when
help was wanted, etc.).

**Primary objectives.** Make the need and the requested form of support recoverable; leave room for
the counterpart to say what they can actually offer.

**Common risks.** Expecting mind-reading; making the request only after disappointment; framing support
as proof of love or loyalty; a vague `be there for me`; or treating a different offer as rejection
before clarifying capacity.

**Effective forms vary.** `Can you just listen for ten minutes?`, `Can you help me think through two
options?`, and `Could you take dinner tonight?` are different support requests and should not be
collapsed into an empathy score.

---

## 17.10 Context: Different needs or preferences

```yaml
id: ctx_different_needs
type: context
context_id: different_needs
domain: personal
objective_type: mixed
priority: high
tools: [acknowledgment, open_questions, clear_request, fact_vs_story]
```

**Definition.** Both people's preferences or needs are legitimate but incompatible in the current
form: social time vs solitude, spending vs saving, family visits, routines, communication frequency,
travel, household standards, or another ordinary difference.

**Primary objectives.** Stop searching for the guilty party; make both needs explicit; distinguish
need from preferred solution; test whether a workable arrangement exists.

**Common risks.** Moralising preference; assuming compromise must be exactly 50/50; offering a
solution before the other need is understood; or treating one person's disappointment as evidence
that the arrangement is unfair.

---

## 17.11 Context: Trust rupture / broken agreement

```yaml
id: ctx_trust_rupture
type: context
context_id: trust_rupture
domain: personal
objective_type: mixed
priority: high
tools: [acknowledgment, fair_responsibility, open_questions, repair_reset]
```

**Definition.** A meaningful ordinary agreement was broken or information was withheld in a way that
has damaged trust, but the scenario does not involve abuse, coercive control, violence, stalking, or
other out-of-scope content.

**Primary objectives.** Establish what agreement each person believed existed; distinguish fact from
interpretation; receive impact; take accurate responsibility; identify what, if anything, can be
reliably changed next.

**Common risks.** Arguing intent before acknowledging the broken agreement; demanding immediate trust
restoration; making sweeping promises; minimising impact because the behaviour seems small; or
accepting a false global identity claim (`you can never be trusted`) as a factual premise.

**Safety boundary.** This context is for ordinary relational breaches only. If the scenario contains
coercion, threats, stalking, abuse, or immediate danger, the safety route replaces standard practice.

---

# 18. Methodological Evidence, Maintenance and Known Limits

## 18.1 Evidence stance

```yaml
id: evidence_01
type: principle
priority: high
```

The Manual distinguishes three evidence levels:

1. **Universal / mechanism-level rules** supported by the communication objective and
   observable interaction (e.g., false responsibility, attack on person vs problem,
   actionable request).
2. **Country baseline rules** used as probabilistic calibration, never as deterministic
   facts about an individual.
3. **Product-derived calibration** learned from validated real sessions and documented in
   future change logs.

## 18.2 External evidence used for the current country layer

The country layer is intentionally conservative.

- Government of Canada, Language Portal of Canada: routine and positive business messages
  commonly use a direct approach with the main idea up front; negative/bad-news messages
  may use a buffer/explanation before the bad news. This supports modelling Canada as
  explicit communication with context-sensitive mitigation rather than as a blanket
  high-context culture.
- Cross-cultural communication literature consistently describes the United States as a
  low-context environment with a relatively direct communication preference, while also
  warning that individual, organisational and regional differences are substantial.
- The Manual therefore uses Canada/USA as **relative baselines** and gives scenario,
  counterpart, domain and relationship stronger authority than country stereotype.

## 18.3 Geographic scope

This Manual covers **English-language Canada and the United States**. It does not claim a separate
model for Francophone Quebec or other French-dominant environments. A later version may add
`evaluation_market: canada_francophone` only after the methodology is separately researched
and validated.

## 18.4 Digital communication scope

The current scenario metadata supports `text`, `email` and `chat`, but the current delivery-signal
engine is voice-first. For asynchronous written scenarios:

- acoustic signals are `not_assessed`;
- timing is evaluated only when scenario logic explicitly makes response delay relevant;
- punctuation, emoji, formatting and message length are not scored until separate rules are
  written and validated;
- direct/indirect business-message structure may be evaluated from semantic order.

## 18.5 What remains outside the current methodology

The Manual does not yet model:

- regional subcultures within either country as hard-coded scoring profiles;
- demographic stereotypes by age, gender, ethnicity or profession;
- clinical or personality interpretation;
- accent or pronunciation quality;
- video-based facial-expression or body-language scoring;
- physical mirroring or imitation;
- culture-specific rules unsupported by observable scenario outcomes;
- diagnosis of relationship quality or of an absent third party;
- claims that a communication technique can reliably produce forgiveness, compliance, calm, or
  behaviour change in another person.

## 18.6 Change discipline

Any future rule that says a Canadian or U.S. user "should" communicate differently must
name:

- the behaviour;
- the context;
- the mechanism by which it affects the objective;
- observable evidence;
- an exception;
- confidence level;
- evidence source or production pattern that justified the change.

A cultural statement without those elements belongs in commentary, not in the scoring
Manual.
# Change Log

## Version 2.1.1 - 2026-08-29

Implementation-contract cleanup, produced from an implementation readiness audit. This
release contains technical-contract clarifications and metadata normalization, with no
intended change to the underlying communication methodology except the explicitly approved
Semantic Response correction (`ev_04`). The methodology accepted in v2.1 — including Canada/
USA as distinct evaluation markets, personal communication as a first-class V1 domain, the
evidence/semantic-response/interpretation/evaluation layering, L2 fairness, the no-Cultural-
Fitness-score rule, uncertainty-as-a-preferred-outcome, and every dimension/objective/red-line
rule — is unchanged in substance.

**Methodology change (one, explicitly approved):**
- `ev_04` (Semantic Response unit) rewritten from a deterministic, unconditional merge
  instruction to a conceptual contract: a semantic response is a derived reconstruction of
  one human reply from raw VAD fragments; exact grouping is owned by a versioned grouping
  algorithm, never hardcoded here; every boundary resolves to `merge` / `separate` /
  `ambiguous`; an `ambiguous` boundary is never treated as merged, and an interpretation that
  depends on its resolution is confidence-capped or `uncertain` under `ev_05`/`ev_06`.

**Technical-contract clarifications (no methodology change):**
- `sig_response_latency` / `ev_04`: added an explicit measurement-precision limitation for
  "counterpart utterance end" — it is measured from the best available audio-lifecycle proxy,
  not a proven exact client-audible instant; small latency differences and near-zero
  boundaries must weigh this limitation into their confidence.
- `ret_01`: added point 6 — every block inherits the version of its parent Manual version; a
  block never carries its own `manual_version`. The stray `manual_version: 2.0` on the
  `purpose` block (already stale against the v2.1 header) has been removed.
- Context metadata standardized throughout: `context_id` (a context block's own identity),
  `context_type` (a single-context reference, replacing the previously inconsistent bare
  `context:` key), and `contexts` (a multi-context applicability list) are now used
  consistently across core playbooks, personal playbooks, and every validation example.
- Every playbook block (core and personal) now carries the same metadata shape:
  `id`, `type: playbook`, `context_type`, `domain`, `objective_type`, `tools`, `priority`.
- Every core §6 context block now declares explicit `domain` and `objective_type` values,
  classified individually rather than defaulted to `workplace` — several remain `domain: mixed`
  specifically because v2.1 already uses them in personal scenarios, and two remain
  `objective_type: scenario_specific` where no single default is methodologically honest.
- Added `sig_00` binding rules for signals with no current measurement source: such a signal's
  state is `not_available`, never estimated from general impression; a blocked interpretive
  rule returns `uncertain`, a blocked evaluative rule returns `not_assessed`. All sixteen
  signals remain fully specified.
- Added `id: ret_metadata_schema` (§1.8): a single retrievable block defining the intended
  meaning, cardinality, optionality, and scenario-vs-block inheritance of every metadata field
  used in this Manual.
- Pre-ingestion structural cleanup, found by the versioned Manual parser before this source was
  first uploaded into the Manual infrastructure: YAML syntax cleanup for machine-readable
  fences — the `ev_04` boundary-states example fence is now labelled ` ```text ` instead of
  ` ```yaml ` (it was always illustrative pseudo-syntax, never machine-readable YAML), and
  `val_01`'s `ex_013.fragment` now uses a block scalar instead of a single-quoted string that an
  internal apostrophe was terminating early; and explicit `type: cultural_rule` metadata added to
  the seventeen `reg_*` country contrast-rule blocks in §4.7-4.23, alongside `reg_us_base`/
  `reg_ca_base`, which already carried it.
- Wrapped the "Decisions in force" table and §1.6 in proper `id`-bearing blocks
  (`manual_decisions`, `ret_runtime_contract`) so this content survives being retrieved on its
  own, per `ret_01`'s own retrieval contract.
- `dir_06`: made explicit that `user_direction: unknown` is a normal operational state in which
  objective/context evaluation proceeds normally — only style-calibration advice is withheld.
- `cp_03`: made explicit the distinction between the generic anti-sycophancy rule (warmth/
  politeness/effort/naming a technique never constitutes a concession by itself) and
  scenario-declared concession conditions (which must correspond to observable conversational
  developments).

## Version 2.1 - 2026-08-29

Integrated professional + personal methodology candidate.

**Added:** §16 Personal and Relational Domain Layer; §17 Relational Context Taxonomy with eleven
personal contexts; six personal-domain playbooks in §10; six personal validation cases in §15;
personal-domain self-report items in `dir_02`; `objective_type` in every scenario specification.

**Personal contexts added:** `raising_personal_issue`, `receiving_hurt_disappointment`,
`emotional_disclosure`, `recurring_conflict`, `repair_after_rupture`, `unequal_investment`,
`family_obligation`, `parent_child_limit`, `asking_for_support`, `different_needs`, and
`trust_rupture`. (`relationship_repair` in the shared taxonomy remains available for general repair;
`repair_after_rupture` is the dedicated relational form.)

**Corrected:** personal counterpart movement is no longer deterministic after a technique is used;
pauses are not ranked as universally best responses; `why` is evaluated by conversational function
rather than treated as a banned form; country calibration is explicitly weaker than relationship
history and counterpart style in established personal relationships.

**Preserved:** evidence-first evaluation, uncertainty, L2 fairness, safety boundaries, Canada/USA as
relative evaluation baselines, no Cultural Fitness score, no fixed culturally diagnostic acoustic
thresholds, and scenario objective before style scores.

## Version 2.0 - 2026-08-29

Major methodology revision.

Changes:

- Made `evaluation_market: canada | usa` mandatory for scored scenarios.
- Replaced the inaccurate Canada-high-context / USA-low-context binary with two relative
  low-context North American baselines.
- Separated country baseline from room register, counterpart style, domain, relationship,
  power and channel.
- Prohibited country stereotypes from acting as automatic scoring rules.
- Added sixteen Canada/USA contrast rules and a professional/personal domain modifier.
- Removed any need for a Cultural Fitness score; added narrative Context Fit only when a
  country/context mismatch materially affects the exchange.
- Expanded context taxonomy from six to fifteen contexts.
- Expanded tool library to sixteen retrievable tools, including Fact vs Story, Boundary,
  Fair Responsibility, False Premise Correction, Problem-not-Person, Self-Advocacy,
  Floor Reclamation, Mirroring, Repair and Reset, Clear Request and Graceful Repetition.
- Expanded playbooks to cover fair/unfair criticism, aggression, upset person,
  disagreement, feedback, requests, self-advocacy, soft no, negotiation and repair.
- Completed six previously deferred delivery signals and removed fixed culturally
  diagnostic timing/WPM claims.
- Added country-sensitive validation examples and an empirical validation gate.
- Added explicit scope for English-language Canada and U.S.; Francophone Canada remains a
  future separately validated module.

Reason:

The product is intended to evaluate users differently for Canadian and U.S. communication
environments. V1's register architecture was strong but risked conflating country with a
direct/indirect style axis. V2 makes country operational without turning national averages
into stereotypes or acoustic thresholds into psychological conclusions.
