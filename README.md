# lodestone position finder
a browser tool for figuring out roughly where a player is based on lodestone compass bearings.

**by tidodda** — [github](https://github.com/tidodda) [website](https://tidodda.dev)

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

this basically comes down to how close your lodestones are to the target. a compass reading only narrows things to about a 5.6 degree wedge, so the further away the lodestone, the bigger the error.

### validation results

ran 100 trials with 18 random lodestones across a 200,000 block radius:

| metric | blocks |
|---|---|
| mean error | 5,107 |
| median error | 4,568 |
| best case | 501 |
| worst case | 18,228 |

**what this means:** typical result lands in the low thousands. the 36x spread between best and worst case is purely from how the random lodestone geometry happened to angle around the target each trial—nothing to do with solver noise. tighter, deliberate lodestone placement (evenly spread around target instead of pure random scatter) would shrink both mean and worst-case tail significantly.

---

# technical deep dive

## the problem
compasses don't point—they tell you a sector. 32 sprites, each 11.25° wide. you get a bunch of these wedges and lodestone locations, and need to find where the target is.

complication: data is noisy (bad coords, misread sprite, etc). geometry matters hard. clustered lodestones = huge error even with perfect readings. spread out = tight bounds.

## how it works

### sprites to angles
compass sprites 0-31 map directly to angles:
```
angle = ((s + 17.5) / 32) * 2π
```

sprite 0 points north, 8 points east, 16 south, 24 west. the 17.5 offset centers each sprite on its angle. but compasses aren't precise—each sprite covers 11.25°. so a reading narrows it down: the target is somewhere in that wedge. mathematically, it must satisfy two constraints (the wedge's left and right boundaries).

### algorithm a: exact wedge intersection

polygonal approach. stack all constraints and find where they all overlap.

how it works:
1. big search box around your lodestones
2. for each lodestone reading, clip that box against the bearing wedge. sutherland-hodgman polygon clipping: walk edges, keep the right side, cut away the wrong side
3. if the polygon vanishes, readings contradict each other
4. otherwise, polygon center = your position. max distance to a vertex = uncertainty

if clipping fails, try dropping readings. test: drop nothing, drop 1, drop 2, etc. re-clip each combo and score by residual error across all original readings (even excluded ones). use the combo with the best fit. only jump to dropping more if you get > 2° improvement.

works great with 3+ readings spread at different angles. breaks when readings are nearly parallel or too contradictory to salvage.

### algorithm b: weighted least-squares with ensembles

the forgiving approach. instead of exact regions, fit a position by minimizing angular error, weight closer lodestones higher (angular error matters more up close), and try 60 random subsets instead of betting everything on one fit.

how it works:
1. each reading is a linear equation. target at (x, z), lodestone at (lx, lz), bearing θ:
   ```
   sin(θ)·x - cos(θ)·z = sin(θ)·lx - cos(θ)·lz
   ```
   solve the matrix system

2. distance to each lodestone determines weight (weight = 1/distance). re-solve 3 times

3. take random subsets (≤6 readings each). solve each one. collect 60 answers

4. find the point closest to all 60 (geometric median). this resists outliers better than averaging

5. detect bad readings: check residuals, flag anything > median + 6·MAD. if you have outliers and still have 3+ good ones, re-run on the good subset

6. uncertainty = spread of your 60 estimates. tight = good geometry, scattered = noisy

handles messy data, bad geometry, outliers. always produces something. won't be as tight as algorithm a if data is clean.

### pick a winner

both algorithms ran. algorithm a skips if you have < 3 readings. compare their uncertainties. pick the smaller one. if only one worked, use it. if both fail, your readings don't work together.

### final numbers

using the chosen position and kept readings:

- **RMS residual:** average bearing error. tells you if readings agree
- **bearing spread:** biggest angle difference between any two readings. < 25° means bad geometry
- **uncertainty radius:** rough error bound in blocks

### output

position (x, z), uncertainty, residual, which algorithm won, any warnings, and maps of the region

## why both algorithms

algorithm a gives you the tightest region if data is clean and geometry is nice. every point in the result actually satisfies all constraints.

real data sucks though. misread a sprite, lodestone location off by 10 blocks, geometry too parallel—algorithm b handles that. tries subsets, doesn't care about tightness, just robustness. always finds something.

both together: a is tight when it works. b is reliable when a breaks. pick whichever is better.

## gotchas

**clustered readings:** if all bearings come from one direction, even small errors blow up the position error. the tool flags this when spread < 25°.

**only 2 lodestones:** technically works (two wedges define a point). fragile though. use more if possible.

**contradictory readings:** algorithm a tries dropping 1-2 to make them work. algorithm b accepts scatter. both fail? your data is broken. check lodestone coords and sprite reads.

**colinear lodestones:** all on a line from you means tight error perpendicular to the line, huge error along it. the geometry warning catches it.

## speed

algorithm a is O(n²) because it checks combos, but you'd need 10+ readings to notice. algorithm b runs 60 random subsets in parallel-ish. total: under 100ms.

## origin

wedge intersection comes from computational geometry (sutherland-hodgman). weighted least-squares is from surveying. the ensemble thing is RANSAC—you don't know which readings suck so you try many random subsets and let the good ones vote. adapted for compass readings.
