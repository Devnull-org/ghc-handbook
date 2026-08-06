-- | Everything Haskell offers for taking things apart — multi-equation
-- definitions, nested constructor patterns, guards, `where`, `if`, `let` —
-- collapses into exactly one Core construct: `case`.
--
-- The desugared Core shows the pattern-match compiler's output, including the
-- default alternatives that make matching exhaustive.
module Patterns where

data Shape
  = Circle Double
  | Rect Double Double
  | Point

area :: Shape -> Double
area (Circle r) = pi * r * r
area (Rect w h) = w * h
area Point = 0

classify :: Int -> String
classify n
  | n < 0 = "negative"
  | n == 0 = "zero"
  | n < small = "small"
  | otherwise = "large"
  where
    small = 10

firstTwo :: [a] -> Maybe (a, a)
firstTwo (x : y : _) = Just (x, y)
firstTwo _ = Nothing
