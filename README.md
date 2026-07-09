# lodestone position finder

a browser tool for figuring out roughly where a player is based on lodestone compass bearings.

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

made by tidodda
