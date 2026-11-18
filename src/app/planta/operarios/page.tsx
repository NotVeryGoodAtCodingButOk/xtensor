import { redirect } from "next/navigation";

/** La planta vive en /planta/piso (funciona sin conexión). */
export default function FactoryWorkersRedirect() {
  redirect("/planta/piso?v=operarios");
}
