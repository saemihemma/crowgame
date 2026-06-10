extends RefCounted
class_name MathDomains
## Single source of truth for the 8 math domains. Referenced everywhere instead
## of re-listing the array (ELOManager, LearnerStateManager, tests). Order
## matters for parity with the TS source — do not reorder.

const ALL := [
	"addition", "subtraction", "multiplication", "division",
	"counting", "comparison", "pattern_matching", "number_sequence",
]
