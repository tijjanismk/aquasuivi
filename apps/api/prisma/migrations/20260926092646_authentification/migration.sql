-- CreateTable
CREATE TABLE "JetonRafraichissement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appareilId" TEXT,
    "famille" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "remplaceLe" TIMESTAMP(3),
    "revoqueLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JetonRafraichissement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JetonRafraichissement_empreinte_key" ON "JetonRafraichissement"("empreinte");

-- CreateIndex
CREATE INDEX "JetonRafraichissement_userId_idx" ON "JetonRafraichissement"("userId");

-- CreateIndex
CREATE INDEX "JetonRafraichissement_famille_idx" ON "JetonRafraichissement"("famille");

-- AddForeignKey
ALTER TABLE "JetonRafraichissement" ADD CONSTRAINT "JetonRafraichissement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JetonRafraichissement" ADD CONSTRAINT "JetonRafraichissement_appareilId_fkey" FOREIGN KEY ("appareilId") REFERENCES "Appareil"("id") ON DELETE CASCADE ON UPDATE CASCADE;
