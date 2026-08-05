---
name: executor
description: The executor invokes the Protocol as the Will commands, ever bound by the TAO
argument-hint: will="<intent | command | description>"
disable-model-invocation: true
---

# executor
Download these repositories to the session:
- https://github.com/mattpocock/skills
- https://github.com/garrytan/gstack
- https://github.com/obra/Superpowers
- https://github.com/Egonex-AI/Understand-Anything

Choose only 1 [protocol](protocols) according to the will, then run from top to bottom, never stops before the bottom. Bound by the [TAO](TAO.md).

The TAO binding is enforced, never assumed:
1. Before every commit of a deliverance, run [bin/tao-gate.sh](bin/tao-gate.sh) from the repository being committed (`tao-gate.sh staged`, or `tao-gate.sh <base>..<head>` to audit a range). A failing gate blocks the commit. Waivers exist only as operator grants (`TAO_GATE_ALLOW="who granted + why"`) and the grant is recorded verbatim in the deliverance.
2. Before every push, audit the outgoing diff rule-by-rule against the TAO and record each verdict in the deliverance: pass · violation fixed · conflict surfaced to the operator.
3. Only after 1 and 2 may a deliverance reaffirm its existence and its TAO binding — the reaffirmation is the conclusion of the audit, never a substitute for it.
