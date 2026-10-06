import { currentUser } from "./session";

/** The signed-in coordinator, or null. */
export async function currentCoordinator() {
  const user = await currentUser();
  return user?.role === "coordinator" ? user : null;
}

export const coordinatorsOnly = () => Response.json({ error: "Only coordinators can do this." }, { status: 403 });
