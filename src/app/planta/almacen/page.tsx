import { redirect } from "next/navigation";

/** Almacén es una vista de /planta/piso (funciona sin conexión). */
export default function FactoryAlmacenRedirect() {
  redirect("/planta/piso?v=almacen");
}
