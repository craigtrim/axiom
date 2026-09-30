# Parent suggestions

Add Parents and Text Entities > Add entity can ask the installed Claude or Codex CLI for existing parent classes. Both use the assistant selected in Axiom and its existing CLI sign-in. Suggesting parents does not edit the ontology.

The prompt includes the selected name, description, current parents, and the complete catalog of named classes with their parent links. Class IDs keep the catalog compact and map back to exact IRIs. The assistant can propose a parent whose name has no words in common with the selected class. Descriptions are shortened as needed to fit the 600,000-character request limit; classes are never silently omitted. Catalogs that exceed the limit produce an error.

The Prompt button shows the upcoming request before a new run and the recorded request for an existing run. Each run saves its provider, context, exact prompt, explanations and outcome. Failed and cancelled runs retain the prompt. Old runs produced by the local word-matching rule remain labeled as local matching and do not acquire an invented assistant prompt.

Add Parents applies only selected suggestions. It checks that each parent still exists and that the edit cannot create a hierarchy cycle. An accepted edit supports Undo. In Add entity, a suggested parent becomes a chosen parent only when the user chooses its option in the parent combobox; Add class saves the class and its chosen parents together. Closing or changing the draft cancels its pending assistant request.

There is no fallback to word matching when an assistant is missing or fails. Phrase matches appear under `From the phrase` in the same parent combobox, separately from `Suggested by Claude` or `Suggested by Codex`.
