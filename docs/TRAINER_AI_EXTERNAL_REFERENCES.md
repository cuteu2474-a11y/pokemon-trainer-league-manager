# Trainer AI external search references

This project keeps **@pkmn/sim with the league's level-free GP rules** as
the only authoritative damage, status, and outcome engine. External Pokémon
engines cannot be dropped in without changing these game rules.

## Referenced open-source engines

- [Poke Engine](https://github.com/pmariglia/poke-engine), MIT license:
  expectiminimax-style pessimistic opponent-response evaluation. The current
  JavaScript rollout computes the worst sampled Showdown outcome, then
  uses a bounded conservative blend for high-skill trainers. This is a
  fresh JavaScript adaptation of a standard search idea, **not copied Rust**.
- [Battle Engine](https://github.com/eykzhang/battle-engine), MIT license:
  opponent-set uncertainty and real competitive benchmarking. This is a
  research reference, **not an embedded Python dependency**.
- [Foul Play](https://github.com/pmariglia/foul-play), GPL-3.0:
  evaluated as an integration candidate, **not bundled or linked**.

## Compatibility and remaining gaps

- External engines do not implement this project's 5-trainer relay,
  level-free CA/PA damage, 10% recovery between trainer rounds,
  and custom enhancement mechanics out of the box.
- The existing bounded clone rollouts are an **approximation**, not proof of
  optimality. In particular, future work must hide non-revealed opponent
  information from candidate construction and benchmark head-to-head play.
- A 20-rated trainer no longer deliberately rolls into the novice
  decision path. Opponent counterplay is reflected in the worst observed
  rollout outcome, with an explicit risk budget.
- The search never changes Pokémon stats, Showdown legality, or battle rules.
- Keep the upstream MIT attribution with any future direct source reuse.
