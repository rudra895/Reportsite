import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import type { Employee, SubBroker } from "@/types/brokerage";

export const Route = createFileRoute("/_app/mapping")({
  component: MappingPage,
});

function MappingPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [subs, setSubs] = useState<SubBroker[]>([]);
  const [filter, setFilter] = useState("");
  const [newEmp, setNewEmp] = useState({ name: "", code: "" });
  const [newSub, setNewSub] = useState({ code: "", name: "" });

  const load = async () => {
    const [e, s] = await Promise.all([
      supabase.from("employees").select("*").order("name"),
      supabase.from("sub_brokers").select("*").order("code"),
    ]);
    setEmployees((e.data ?? []) as Employee[]);
    setSubs((s.data ?? []) as SubBroker[]);
  };
  useEffect(() => {
    load();
  }, []);

  const updateSubEmployee = async (id: string, employee_id: string | null) => {
    const { error } = await supabase
      .from("sub_brokers")
      .update({ employee_id })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setSubs((cur) => cur.map((s) => (s.id === id ? { ...s, employee_id } : s)));
  };

  const deleteSub = async (id: string) => {
    if (!confirm("Delete this sub-broker?")) return;
    const { error } = await supabase.from("sub_brokers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setSubs((cur) => cur.filter((s) => s.id !== id));
  };

  const deleteEmp = async (id: string) => {
    if (!confirm("Delete this employee? Sub-brokers mapped to them will become unmapped.")) return;
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await load();
  };

  const addEmp = async () => {
    if (!newEmp.name.trim()) return;
    const { error } = await supabase.from("employees").insert({
      name: newEmp.name.trim(),
      code: newEmp.code.trim() || null,
    });
    if (error) return toast.error(error.message);
    setNewEmp({ name: "", code: "" });
    await load();
  };

  const addSub = async () => {
    if (!newSub.code.trim()) return;
    const code = newSub.code.trim();
    const tag = code.endsWith("_AP") ? "AP" : code.endsWith("_SUB") ? "SUB" : null;
    const { error } = await supabase
      .from("sub_brokers")
      .insert({ code, name: newSub.name.trim() || null, tag });
    if (error) return toast.error(error.message);
    setNewSub({ code: "", name: "" });
    await load();
  };

  const updateEmp = async (id: string, patch: Partial<Employee>) => {
    const { error } = await supabase.from("employees").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    await load();
  };

  const filteredSubs = subs.filter(
    (s) =>
      !filter ||
      s.code.toLowerCase().includes(filter.toLowerCase()) ||
      (s.name ?? "").toLowerCase().includes(filter.toLowerCase()),
  );

  const empName = (id: string | null) =>
    employees.find((e) => e.id === id)?.name ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Employees</CardTitle>
          <CardDescription>
            Manage employees and their personal broker code. The "default" employee absorbs all unmapped sub-brokers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Name</th>
                  <th>Own code</th>
                  <th>Default catch-all</th>
                  <th>Mapped subs</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="border-b">
                    <td className="py-2">
                      <Input
                        defaultValue={e.name}
                        onBlur={(ev) =>
                          ev.target.value !== e.name &&
                          updateEmp(e.id, { name: ev.target.value })
                        }
                      />
                    </td>
                    <td>
                      <Input
                        defaultValue={e.code ?? ""}
                        placeholder="—"
                        onBlur={(ev) =>
                          ev.target.value !== (e.code ?? "") &&
                          updateEmp(e.id, { code: ev.target.value.trim() || null })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={e.is_default}
                        onChange={async (ev) => {
                          if (ev.target.checked) {
                            await supabase
                              .from("employees")
                              .update({ is_default: false })
                              .neq("id", e.id);
                          }
                          await updateEmp(e.id, { is_default: ev.target.checked });
                        }}
                      />
                    </td>
                    <td>{subs.filter((s) => s.employee_id === e.id).length}</td>
                    <td className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => deleteEmp(e.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={newEmp.name}
                onChange={(e) => setNewEmp({ ...newEmp, name: e.target.value })}
                placeholder="New employee"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Own code</Label>
              <Input
                value={newEmp.code}
                onChange={(e) => setNewEmp({ ...newEmp, code: e.target.value })}
                placeholder="SSJxxxx"
              />
            </div>
            <Button onClick={addEmp}>
              <Plus className="mr-1 h-4 w-4" /> Add employee
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sub-Brokers / APs ({subs.length})</CardTitle>
          <CardDescription>Map each sub-broker to the accountable employee.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search code or name…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-sm"
          />
          <div className="max-h-[60vh] overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-2 py-2">Code</th>
                  <th>Name</th>
                  <th>Tag</th>
                  <th>Accountable to</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredSubs.map((s) => (
                  <tr key={s.id} className="border-b">
                    <td className="px-2 py-1.5 font-mono text-xs">{s.code}</td>
                    <td className="text-xs">{s.name ?? "—"}</td>
                    <td>{s.tag && <Badge variant="outline">{s.tag}</Badge>}</td>
                    <td>
                      <Select
                        value={s.employee_id ?? "none"}
                        onValueChange={(v) => updateSubEmployee(s.id, v === "none" ? null : v)}
                      >
                        <SelectTrigger className="w-56">
                          <SelectValue>
                            {empName(s.employee_id) ?? <span className="text-muted-foreground">— Unmapped —</span>}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Unmapped —</SelectItem>
                          {employees.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name}
                              {e.is_default ? " (default)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td>
                      <Button variant="ghost" size="icon" onClick={() => deleteSub(s.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input
                value={newSub.code}
                onChange={(e) => setNewSub({ ...newSub, code: e.target.value.toUpperCase() })}
                placeholder="XXXX_AP / XXXX_SUB"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={newSub.name}
                onChange={(e) => setNewSub({ ...newSub, name: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <Button onClick={addSub}>
              <Plus className="mr-1 h-4 w-4" /> Add sub-broker
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
