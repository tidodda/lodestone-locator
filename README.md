# lodestone position finder
a browser tool for figuring out roughly where a player is based on lodestone compass bearings.

**by tidodda**
[github](https://github.com/tidodda) [website](https://tidodda.dev)

## how it works
1. place lodestones at coords you know and link compasses to them
2. get the compasses into the target's inventory somehow
3. read which of the 32 sprite positions each compass needle is showing
4. type each lodestone's coords + sprite reading into the tool
5. hit estimate position

it runs a bunch of random subsets of your readings, solves each one, then takes the geometric median of all of them.

## files
```
index.html          the page
style.css            styling
script.js            all the math + logic
compass_textures/
  compass_00.png
  compass_01.png
  ...
  compass_31.png     32 sprite images, one per needle position
```

## setup
just go to https://lodestone-locator.vercel.app/

## usage notes
- need at least 2 lodestones to get any estimate, 4+ spread out at different angles gives a much better fit
- you can paste json to bulk load lodestones instead of clicking add row a bunch of times, format looks like:
  ```json
  [{"x": -25000000, "z": 10000000, "sprite": 12}, ...]
  ```

## accuracy

comes down mostly to how close your lodestones are to the target. a compass reading only narrows things to about a 5.6 degree wedge, so the farther the lodestone, the bigger the error.

### validation results

ran 100 trials, 18 random lodestones scattered across a 200,000 block radius:

| metric | blocks |
|---|---|
| mean error | 5,107 |
| median error | 4,568 |
| best case | 501 |
| worst case | 18,228 |

typical result lands in the low thousands. the 36x gap between best and worst case is just how the lodestone geometry happened to fall relative to the target each trial, not solver noise. placing lodestones deliberately, spread evenly around the target instead of random scatter, shrinks both the mean and the worst case a lot.

---

# technical deep dive

## the problem
compasses don't point, they tell you a sector. 32 sprites, each 11.25° wide. you end up with a pile of wedges and lodestone locations and need to find where they overlap.

the data's noisy too. bad coords, misread sprites, that kind of thing. and geometry matters a lot. clustered lodestones give a huge error even with perfect readings, spread out and the bounds get tight fast.

## sprites to angles
compass sprites 0-31 map directly to angles:
```
angle = ((s + 17.5) / 32) * 2π
```
sprite 0 points north, 8 east, 16 south, 24 west. the 17.5 offset centers each sprite on its angle. each sprite covers 11.25° of actual bearing though, so a reading gives you a wedge, not a line. that's really two constraints, a left edge and a right edge.

## algorithm a: exact wedge intersection

the polygon approach. stack every constraint and see where they all overlap.

start with a big search box around your lodestones. for each reading, clip the box against that bearing's wedge using sutherland-hodgman polygon clipping, walking the edges and keeping the side that satisfies the constraint. if the polygon disappears entirely, the readings contradict each other. otherwise the polygon's center is your position, and the farthest vertex from center gives the uncertainty.

when clipping fails, it starts dropping readings. drop none, then 1, then 2, re-clipping each combo and scoring by residual error across all the original readings, including the ones left out of that particular fit. best combo wins, and it only drops more if that gets a 2°+ improvement.

works great with 3+ readings spread at different angles. breaks down when readings are nearly parallel or too contradictory to reconcile.

## algorithm b: weighted least-squares with an ensemble

more forgiving. instead of solving for an exact region, each reading becomes a linear equation, target at (x, z), lodestone at (lx, lz), bearing θ:
```
sin(θ)·x - cos(θ)·z = sin(θ)·lx - cos(θ)·lz
```
solved as a matrix system. closer lodestones get weighted more heavily since their angular error matters more, then it's re-solved a few times.

instead of trusting one fit, it takes 300 random subsets of the readings, up to 6 each, solves every one, and finds the point closest to all of them, the geometric median. that holds up against outliers much better than a plain average. bad readings get flagged by checking residuals against median + 6·MAD (with a 15° floor, so tight data isn't flagged over noise), and if outliers show up but 3+ good readings remain, it re-runs on just those.

uncertainty comes from how spread out those 300 estimates end up around the median — the 50th percentile spread is reported as a "typical" figure, the 90th percentile as a worst-case. tight cluster on both means good geometry, a big gap between them means the fit is shakier than it looks. it always produces something, messy data or bad geometry or outliers included, though it won't be as tight as algorithm a when the input is clean.

*(earlier versions ran several small ensembles and kept whichever one reported the smallest spread — that's just picking the luckiest random draw and reporting its optimistic number as if it were the real uncertainty. one larger ensemble, read honestly, gives an unbiased estimate instead.)*

## picking a winner

both algorithms run every time, though algorithm a skips itself under 3 readings. algorithm a wins whenever it produces a result — it's an exact feasible region derived straight from the constraints, not a heuristic, so a smaller-looking number from algorithm b doesn't get to override it. algorithm b only takes over when a's wedges don't overlap at all (too few readings, or the data's too contradictory to reconcile). if only one produced a result, that one's used. if both fail, the readings just don't work together.

as a sanity check, if b's point falls outside a's region, that's flagged as a disagreement — usually means a bad reading or wrong sprite somewhere worth double-checking, rather than something to silently resolve by comparing magnitudes.

## the numbers you get

for whichever position won, using the readings that were kept:

- **RMS residual**: average bearing error, shows whether the readings agree with each other
- **bearing spread**: biggest angle gap between any two readings, under 25° usually means bad geometry
- **uncertainty radius**: rough error bound in blocks — shown as a typical/worst-case pair when algorithm b's ensemble is what's driving the number, since a single figure there would hide how much the estimate could still move

plus the position itself, which algorithm won, any warnings, and a map of the region.

## why both algorithms

algorithm a gives the tightest region when the data's clean and the geometry's decent, every point in its result satisfies all the constraints. but real data is messy: a misread sprite, a lodestone off by 10 blocks, readings too parallel to pin anything down. algorithm b doesn't care about being tight, it cares about not falling over. a wins when it can, b covers for it when it can't.

## known failure modes

clustered readings are the big one. if every bearing comes from roughly the same direction, even small errors blow up the position error. flagged when spread is under 25°.

only 2 lodestones is technically enough, two wedges do define a point, but it's fragile. use more when you can.

contradictory readings get handled differently by each algorithm. a tries dropping 1-2 to make things consistent, b just accepts the scatter. if both give up, something in the data is actually broken, worth double checking lodestone coords and sprite reads.

colinear lodestones, all roughly on a line from you, leave error tight perpendicular to that line but huge along it. same geometry warning catches it.

a and b landing in visibly different spots is its own signal, flagged separately, and worth trusting over either algorithm's own confidence number.

## speed

algorithm a is O(n²) since it checks combinations of dropped readings, but you'd need 10+ readings before that's noticeable. algorithm b's 300 subsets run essentially in parallel. all told, under 100ms.

## where this comes from

wedge intersection is standard computational geometry, sutherland-hodgman clipping. weighted least-squares is straight out of surveying. the random subsets idea is basically RANSAC, you don't know in advance which readings are bad, so you try a bunch of random subsets and let the good ones outvote the bad. adapted here for compass bearings instead of the usual point-cloud fitting.
