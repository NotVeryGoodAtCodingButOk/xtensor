"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { deleteClientAction, regenerateClientTokenAction, updateClientAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionTooltip } from "@/components/ui/tooltip";

type ClientWithUrl = {
  id: string;
  name: string;
  magic_link_token: string;
  created_at: string;
  clientUrl: string;
};

export function ClientsManager({ clients }: { clients: ClientWithUrl[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Enlace</TableHead>
          <TableHead>Creado</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clients.map((client) =>
          editingId === client.id ? (
            <TableRow key={client.id} className="bg-[var(--xt-yellow-soft)]">
              <TableCell colSpan={2}>
                <form
                  action={updateClientAction}
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    const formData = new FormData(event.currentTarget);
                    const nextName = String(formData.get("name") ?? "").trim();
                    const mergeTarget = clients.find(
                      (candidate) => candidate.id !== client.id && candidate.name.trim() === nextName,
                    );

                    if (
                      mergeTarget &&
                      !confirm(
                        `¿Fusionar "${client.name}" con "${mergeTarget.name}"? Sus máquinas y enlaces quedarán en un solo cliente.`,
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="clientId" value={client.id} />
                  <Input name="name" defaultValue={client.name} className="h-8 flex-1 text-sm" autoFocus required />
                  <ActionTooltip text="Guarda los cambios del cliente.">
                    <Button type="submit" size="sm">
                      <Check className="h-3 w-3" />
                      Guardar
                    </Button>
                  </ActionTooltip>
                  <ActionTooltip text="Cancela la edición sin guardar.">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </ActionTooltip>
                </form>
              </TableCell>
              <TableCell>{client.created_at.slice(0, 10)}</TableCell>
              <TableCell />
            </TableRow>
          ) : (
            <TableRow key={client.id}>
              <TableCell className="font-medium">{client.name}</TableCell>
              <TableCell className="max-w-xl truncate text-xs text-[var(--xt-steel)]">
                {client.clientUrl}
              </TableCell>
              <TableCell>{client.created_at.slice(0, 10)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <ActionTooltip text="Edita el nombre de este cliente.">
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => setEditingId(client.id)}
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </Button>
                  </ActionTooltip>
                  <form action={regenerateClientTokenAction}>
                    <input type="hidden" name="clientId" value={client.id} />
                    <ActionTooltip text="Genera un nuevo enlace privado para este cliente.">
                      <Button type="submit" size="sm" variant="outline">
                        Regenerar enlace
                      </Button>
                    </ActionTooltip>
                  </form>
                  <form
                    action={deleteClientAction}
                    onSubmit={(e) => {
                      if (
                        !confirm(
                          `¿Eliminar el cliente "${client.name}"? Solo funciona si no tiene máquinas asociadas.`,
                        )
                      )
                        e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="clientId" value={client.id} />
                    <ActionTooltip text="Elimina este cliente si no tiene máquinas asociadas." align="right">
                      <Button type="submit" size="sm" variant="danger">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </ActionTooltip>
                  </form>
                </div>
              </TableCell>
            </TableRow>
          ),
        )}
      </TableBody>
    </Table>
  );
}
