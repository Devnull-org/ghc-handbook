-- | The module the "follow one module" walkthrough traces through GHC.
--   Two functions, chosen so every phase has something visible to do:
--   'describe' carries a class constraint, which becomes a dictionary
--   argument in Core, and 'classify' has a case and a local binding,
--   which become a decision tree and a let.
module Journey (describe, classify) where

describe :: Show a => a -> String
describe x = "value: " ++ show x

classify :: Int -> String
classify n =
  case compare n 0 of
    LT -> "negative"
    EQ -> "zero"
    GT -> positive
  where
    positive = if n > 100 then "big" else "small"
