{-# LANGUAGE BangPatterns #-}

-- | What demand analysis and worker/wrapper are for.
--
-- `sumStrict` is a strict accumulator loop. Demand analysis proves the
-- accumulator is always forced, and worker/wrapper splits the function into a
-- wrapper with the original boxed type and a worker taking an unboxed `Int#`.
-- Look for `$wsumStrict` in the optimised Core, and note the loop allocates
-- nothing.
--
-- `sumLazy` is the same fold without the bang. Compare the two in STG: the lazy
-- version builds a thunk per iteration, and every `let` in STG is an allocation.
module Strict where

sumStrict :: [Int] -> Int
sumStrict = go 0
  where
    go !acc [] = acc
    go !acc (x : xs) = go (acc + x) xs

sumLazy :: [Int] -> Int
sumLazy = go 0
  where
    go acc [] = acc
    go acc (x : xs) = go (acc + x) xs

-- A strict data type: the bangs let GHC unpack the fields, so a Point is two
-- unboxed Ints in one heap object rather than two pointers to two boxes.
data Point = Point !Int !Int

shift :: Int -> Point -> Point
shift d (Point x y) = Point (x + d) (y + d)

-- Constructed product result: `minMax` returns a pair, and CPR analysis lets the
-- caller receive the components directly rather than allocating the tuple.
minMax :: [Int] -> (Int, Int)
minMax [] = (0, 0)
minMax (z : zs) = go z z zs
  where
    go !lo !hi [] = (lo, hi)
    go !lo !hi (w : ws) = go (min lo w) (max hi w) ws
