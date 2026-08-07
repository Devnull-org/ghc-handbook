-- The smallest program that makes the solver look up an instance: one
-- constraint from a signature, one dictionary found by search.
module Dict where

describe :: Show a => a -> String
describe x = "value: " ++ show x

use :: String
use = describe (42 :: Int)
