{-# LANGUAGE GADTs #-}

-- | Why the typechecker separates constraint generation from constraint solving.
--
-- Each branch of `eval` type-checks under a *different* assumption: matching on
-- `IntLit` tells GHC that `a ~ Int`, matching on `BoolLit` that `a ~ Bool`. A
-- checker that unified eagerly would have nowhere to put a fact that holds only
-- inside one alternative, so GHC records it as an implication constraint with a
-- Given, and solves later.
--
-- In the desugared Core the same facts appear as coercions: the evidence that
-- `a` and `Int` really are the same type, made into a term.
module Gadt where

data Expr a where
  IntLit  :: Int -> Expr Int
  BoolLit :: Bool -> Expr Bool
  Add     :: Expr Int -> Expr Int -> Expr Int
  If      :: Expr Bool -> Expr a -> Expr a -> Expr a
  Eq      :: Expr Int -> Expr Int -> Expr Bool

eval :: Expr a -> a
eval (IntLit n) = n
eval (BoolLit b) = b
eval (Add x y) = eval x + eval y
eval (If c t e) = if eval c then eval t else eval e
eval (Eq x y) = eval x == eval y

-- A plain polymorphic function for contrast: no refinement anywhere, so no
-- implications are generated and the constraint set stays flat.
describe :: Show a => a -> String
describe x = "value: " ++ show x
