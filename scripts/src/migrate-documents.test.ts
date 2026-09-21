import { describe, it, expect } from "vitest";
import { calculateMigrationPlan, normalizeTitle } from "./migrate-documents";

describe("Document Migration Planner", () => {
  it("normalizes titles correctly", () => {
    expect(normalizeTitle("  Hello   World  ")).toBe("hello world");
    expect(normalizeTitle("1-Vidhava Sahay Affidavit")).toBe("1-vidhava sahay affidavit");
  });

  it("groups PDF and Word documents with same title", () => {
    const docs = [
      { id: 1, title: "Test Doc", fileType: "PDF", fileUrl: "/pdf", fileName: "test.pdf" },
      { id: 2, title: "Test Doc", fileType: "Word", fileUrl: "/word", fileName: "test.docx" }
    ];

    const plan = calculateMigrationPlan(docs);
    
    expect(plan.updates).toHaveLength(1);
    expect(plan.deletions).toHaveLength(1);
    
    expect(plan.updates[0].id).toBe(1);
    expect(plan.updates[0].wordUrl).toBe("/word");
    expect(plan.updates[0].wordFileName).toBe("test.docx");
    expect(plan.updates[0].groupId).toMatch(/^migrated-group-1/);
    
    expect(plan.deletions[0]).toBe(2);
  });

  it("ignores documents that already have a group ID", () => {
    const docs = [
      { id: 1, title: "Test Doc", fileType: "PDF", groupId: "existing-group" },
    ];
    const plan = calculateMigrationPlan(docs);
    expect(plan.updates).toHaveLength(0);
    expect(plan.deletions).toHaveLength(0);
  });

  it("assigns unique groups to orphaned PDFs", () => {
    const docs = [
      { id: 1, title: "Orphan PDF", fileType: "PDF" },
    ];
    const plan = calculateMigrationPlan(docs);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].groupId).toMatch(/^migrated-group-1/);
    expect(plan.deletions).toHaveLength(0);
  });

  it("leaves ambiguous groups alone (manual review)", () => {
    const docs = [
      { id: 1, title: "Ambig", fileType: "PDF" },
      { id: 2, title: "Ambig", fileType: "PDF" },
      { id: 3, title: "Ambig", fileType: "Word" }
    ];
    const plan = calculateMigrationPlan(docs);
    expect(plan.updates).toHaveLength(0);
    expect(plan.deletions).toHaveLength(0);
  });
});
