// Actions the lighting panel sends to the LightingController.
export const LightingAction = Object.freeze({
  TogglePreview: "preview",
  ToggleGuides: "guides",
  ChoosePreset: "preset",
  Place: "place",
  Select: "select",
  ResetWindow: "window-default",
  Move: "move",
  Duplicate: "duplicate",
  Delete: "delete",
  // Edits come in pairs: previews while a control is moving, then a commit.
  EditLight: "light",
  PreviewLight: "preview-light",
  EditAmbient: "ambient",
  PreviewAmbient: "preview-ambient",
  Load: "load",
  Save: "save",
});

// The edit/preview pairs, for controls that preview before committing.
export const LightEdit = Object.freeze({
  edit: LightingAction.EditLight,
  preview: LightingAction.PreviewLight,
});
export const AmbientEdit = Object.freeze({
  edit: LightingAction.EditAmbient,
  preview: LightingAction.PreviewAmbient,
});
