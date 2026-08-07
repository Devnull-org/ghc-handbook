-- The smallest pipeline that fusion collapses: watch the rule firings, then
-- the simplifier iterations that clean up after them.
module Fuse where

total :: [Int] -> Int
total xs = sum (map (* 2) xs)
