-- | Type classes are the clearest demonstration that Core is a *different*
-- language from Haskell, not a lightly-desugared version of it.
--
-- Watch `describe` acquire an extra argument between the typechecked output and
-- the desugared Core: the class constraint `Show a =>` becomes an ordinary
-- value parameter holding a dictionary of methods.
module Classes where

class Container f where
  empty :: f a
  insert :: a -> f a -> f a

newtype Stack a = Stack [a]

instance Container Stack where
  empty = Stack []
  insert x (Stack xs) = Stack (x : xs)

describe :: Show a => a -> String
describe x = "value: " ++ show x

twice :: Container f => a -> f a -> f a
twice x c = insert x (insert x c)
