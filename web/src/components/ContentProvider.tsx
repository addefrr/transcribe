"use client";

import { createContext, useContext } from "react";
import { type Content, DEFAULT_CONTENT } from "@/lib/content";

// Resolved site copy is fetched once server-side (getContent) and handed to this
// provider in the root layout, so any client component can read editable strings
// via useContent() without prop-drilling.
const ContentContext = createContext<Content>(DEFAULT_CONTENT as unknown as Content);

export function ContentProvider({
  value,
  children,
}: {
  value: Content;
  children: React.ReactNode;
}) {
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent(): Content {
  return useContext(ContentContext);
}
