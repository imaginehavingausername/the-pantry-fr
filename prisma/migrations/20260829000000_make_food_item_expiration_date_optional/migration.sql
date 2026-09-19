-- Food items without a known expiration date are valid pantry entries.
ALTER TABLE "FoodItem"
ALTER COLUMN "expirationDate" DROP NOT NULL;
