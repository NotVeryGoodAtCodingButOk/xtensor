import { bootstrapPreviosFromFixture } from "../src/services/previos";

async function main() {
  const result = await bootstrapPreviosFromFixture();
  console.log(
    `Previos cargados: ${result.previosCreated} previos en ${result.machinesTouched} máquinas. ` +
      `Catálogo detectado: ${result.catalogCreated} nombres.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
