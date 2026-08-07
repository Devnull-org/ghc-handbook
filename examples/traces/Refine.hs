{-# LANGUAGE GADTs #-}

-- The smallest program that forces an implication constraint: each branch of
-- `get` may assume a different equality, so each becomes its own implication
-- with its own Given.
module Refine where

data T a where
  TInt  :: T Int
  TBool :: T Bool

get :: T a -> a
get TInt  = 1
get TBool = True
