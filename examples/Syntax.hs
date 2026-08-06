-- | A deliberately small module aimed at the *front* of the pipeline.
--
-- The point of interest here is the parsed AST rather than the Core: layout
-- (no braces or semicolons are written, yet the parser inserts them),
-- operator sections, `do` notation, and an infix operator whose fixity is not
-- known until the renamer runs.
module Syntax where

infixl 6 |+|

(|+|) :: Int -> Int -> Int
x |+| y = x + y * 2

total :: [Int] -> Int
total xs = sum (map (|+| 1) xs)

greet :: Maybe String -> String
greet name = case name of
  Just n -> "hello, " ++ n
  Nothing -> "hello"

collect :: [Int] -> [Int]
collect xs = do
  x <- xs
  let doubled = x * 2
  pure doubled
