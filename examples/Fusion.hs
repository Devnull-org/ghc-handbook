-- | What the optimiser is actually for.
--
-- `pipeline` reads as three traversals building two intermediate lists. Compare
-- the desugared Core with the optimised Core: rewrite rules and the simplifier
-- fuse the whole thing into a single loop that allocates no list at all.
module Fusion where

pipeline :: [Int] -> Int
pipeline = sum . map (* 2) . filter even

countdown :: Int -> Int
countdown n = go n 0
  where
    go 0 acc = acc
    go k acc = go (k - 1) (acc + k)
