import { useQuery } from "@tanstack/react-query";
import { CONTENT_ROLE, SITE_ADMIN_ROLE, type EditorTemplate } from "../lib/api";
import { useAuth } from "../lib/authContext";
import { queries } from "../lib/queries";

/**
 * The templates a Markdown editor offers, in served order. Only the content and site admin roles
 * can read them, so other editors (league staff on Info, applicants) never send the request. A
 * failed read leaves the menu out rather than putting an error inside a writing tool; Site Admin >
 * Editor templates shows the error.
 */
export function useEditorTemplates(): EditorTemplate[] {
  const { profile, hasRole } = useAuth();
  const viewerId = hasRole(CONTENT_ROLE, SITE_ADMIN_ROLE) ? profile?.id ?? null : null;
  return useQuery(queries.editorTemplates(viewerId)).data?.templates ?? [];
}
