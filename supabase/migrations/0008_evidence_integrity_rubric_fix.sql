-- Evidence-integrity fix: the Evaluation Engine only ever receives a text transcript (no audio,
-- no vocal/timing data — see src/lib/coaching/promptBuilder.ts), but several of the seeded
-- communication_tools rows instructed it, in their own words, to judge whether the user "stayed
-- calm," to "reward calm... responses," or to look at "tone" — i.e. literal paralinguistic
-- signals the coach has no way to observe. That produced real production output like "The user
-- maintained a calm demeanor throughout the conversation." This migration rewrites those specific
-- fields to their transcript-based equivalents (see docs/DECISIONS.md for the full list).
--
-- Every update is guarded by a WHERE clause matching the known original seeded value, so a row a
-- coach has since edited via /admin — and so no longer equals the old seed text — is left alone
-- rather than being silently overwritten.

update public.communication_tools
set core_principles = '["Acknowledge the other person''s emotion before responding to content.",
    "Separate the observable behavior from your interpretation of intent.",
    "State your own position in one or two clear sentences.",
    "Avoid mirroring the other person''s hostility or using escalating language."]'::jsonb
where slug = 'responding-to-aggression'
  and core_principles = '["Acknowledge the other person''s emotion before responding to content.",
    "Separate the observable behavior from your interpretation of intent.",
    "State your own position calmly, in one or two sentences.",
    "Avoid mirroring the other person''s volume or hostility."]'::jsonb;

update public.communication_tools
set common_mistakes = '["Matching the other person''s hostility with similarly aggressive language.",
    "Over-explaining or justifying before acknowledging the concern.",
    "Apologizing for things outside your control just to end the tension.",
    "Going silent or shutting down instead of responding."]'::jsonb
where slug = 'responding-to-aggression'
  and common_mistakes = '["Matching the other person''s hostility or volume.",
    "Over-explaining or justifying before acknowledging the concern.",
    "Apologizing for things outside your control just to end the tension.",
    "Going silent or shutting down instead of responding."]'::jsonb;

update public.communication_tools
set evaluation_criteria = jsonb_set(
      evaluation_criteria, '{non_escalation}',
      '"Based on the words used in the transcript, did the user avoid hostile or retaliatory language and avoid provoking further anger?"'::jsonb
    ),
    coaching_guidance = 'Prioritize whether the user acknowledged the emotion or concern before defending or explaining. Reward concise, non-escalatory wording over long justifications. A user who never acknowledges the other person''s frustration should not score well on acknowledgment even if their facts are correct.'
where slug = 'responding-to-aggression'
  and evaluation_criteria->>'non_escalation' = 'Did the user avoid matching hostility or provoking further anger?'
  and coaching_guidance = 'Prioritize whether the user acknowledged the emotion or concern before defending or explaining. Reward calm, brief responses over long justifications. A user who never acknowledges the other person''s frustration should not score well on acknowledgment even if their facts are correct.';

update public.communication_tools
set common_mistakes = '["Over-justifying with multiple reasons, inviting negotiation.",
    "Softening the boundary until it disappears.",
    "Apologizing so much the boundary loses its force.",
    "Escalating to anger instead of simply restating the limit."]'::jsonb,
    evaluation_criteria = jsonb_set(
      evaluation_criteria, '{non_escalation}',
      '"Based on the words used in the transcript, did the user''s language stay non-escalatory and avoid turning the exchange into a conflict?"'::jsonb
    )
where slug = 'setting-a-boundary'
  and common_mistakes = '["Over-justifying with multiple reasons, inviting negotiation.",
    "Softening the boundary until it disappears.",
    "Apologizing so much the boundary loses its force.",
    "Escalating to anger instead of calmly restating the limit."]'::jsonb
  and evaluation_criteria->>'non_escalation' = 'Did the user stay calm and avoid turning the exchange into a conflict?';

update public.communication_tools
set core_principles = '["Listen for the specific concern underneath the delivery.",
    "Ask a clarifying question before agreeing or disagreeing.",
    "You can accept a valid point without accepting an unfair framing of it.",
    "Decide out loud what you will do differently, if anything."]'::jsonb
where slug = 'handling-criticism'
  and core_principles = '["Listen for the specific concern underneath the delivery.",
    "Ask a clarifying question before agreeing or disagreeing.",
    "You can accept a valid point without accepting an unfair tone.",
    "Decide out loud what you will do differently, if anything."]'::jsonb;

update public.communication_tools
set step_by_step_method = '[{"step":"Let it land","description":"Avoid interrupting or immediately defending."},
    {"step":"Clarify","description":"Ask a specific question about what they mean or want."},
    {"step":"Separate signal from delivery","description":"Respond to the substance, not just how it was phrased."},
    {"step":"State your take","description":"Say what you agree with and what you see differently."},
    {"step":"Close with next step","description":"Say what, if anything, you''ll change."}]'::jsonb
where slug = 'handling-criticism'
  and step_by_step_method = '[{"step":"Let it land","description":"Avoid interrupting or immediately defending."},
    {"step":"Clarify","description":"Ask a specific question about what they mean or want."},
    {"step":"Separate signal from delivery","description":"Respond to the substance, not just the tone."},
    {"step":"State your take","description":"Say what you agree with and what you see differently."},
    {"step":"Close with next step","description":"Say what, if anything, you''ll change."}]'::jsonb;

update public.communication_tools
set common_mistakes = '["Getting defensive before understanding the specific concern.",
    "Capitulating completely just to end the discomfort.",
    "Arguing about how something was phrased instead of addressing the substance.",
    "Agreeing to changes the user doesn''t actually intend to make."]'::jsonb,
    evaluation_criteria = jsonb_set(
      evaluation_criteria, '{non_escalation}',
      '"Based on the words used in the transcript, did the user avoid turning the feedback into an argument?"'::jsonb
    ),
    coaching_guidance = 'Reward asking a clarifying question before reacting. A user who immediately agrees to everything, or immediately rejects everything, has not actually applied the technique even if their wording stayed measured.'
where slug = 'handling-criticism'
  and common_mistakes = '["Getting defensive before understanding the specific concern.",
    "Capitulating completely just to end the discomfort.",
    "Arguing about tone instead of addressing the substance.",
    "Agreeing to changes the user doesn''t actually intend to make."]'::jsonb
  and evaluation_criteria->>'non_escalation' = 'Did the user avoid turning the feedback into an argument?'
  and coaching_guidance = 'Reward asking a clarifying question before reacting. A user who immediately agrees to everything, or immediately rejects everything, has not actually applied the technique even if the tone stayed calm.';

update public.communication_tools
set evaluation_criteria = jsonb_set(
      evaluation_criteria, '{non_escalation}',
      '"Based on the words used in the transcript, did the user''s language stay constructive rather than punitive?"'::jsonb
    )
where slug = 'giving-difficult-feedback'
  and evaluation_criteria->>'non_escalation' = 'Did the user keep the conversation constructive rather than punitive?';

update public.communication_tools
set evaluation_criteria = jsonb_set(
      evaluation_criteria, '{non_escalation}',
      '"Based on the wording used, did the questions stay curious in phrasing rather than becoming pointed or accusatory?"'::jsonb
    )
where slug = 'asking-open-questions'
  and evaluation_criteria->>'non_escalation' = 'Did the questions stay curious rather than becoming pointed or accusatory?';
