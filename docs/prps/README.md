# Product Requirements & Planning Documents (PRPs)

## Active PRPs (Not Yet Implemented)

### 🚧 Connection Synthesis System
**File**: `connection-synthesis-system.md`  
**Status**: Partially implemented - engines built, UI not started  
**Description**: 7-engine collision detection system for discovering connections between documents

**Implementation Progress**:
- ✅ All 7 engines implemented in `worker/engines/`
- ✅ Orchestrator and scoring system complete
- ✅ User weight preferences (migration 016)
- ❌ UI for displaying connections
- ❌ Connection explanation interface

## Archived PRPs (Fully Implemented)

### ✅ Multi-Format Document Processing
**File**: `archive/multi-format-document-processing.md`  
**Status**: COMPLETE  
**Completion Date**: Sep 27, 2025  
**Description**: Support for 6 input formats (PDF, YouTube, Web, Markdown, Text, Paste)

### ✅ YouTube Processing Metadata Enhancement  
**File**: `archive/youtube-processing-metadata-enhancement.md`  
**Status**: COMPLETE  
**Completion Date**: Sep 28, 2025  
**Description**: Enhanced YouTube transcript cleaning, fuzzy positioning, complete metadata

### ✅ Hybrid AI SDK Embeddings Migration
**File**: `archive/hybrid-ai-sdk-embeddings-migration.md`  
**Status**: COMPLETE  
**Completion Date**: Sep 28, 2025  
**Description**: Migrated embeddings to Vercel AI SDK while keeping Gemini for processing

### ✅ Document Processor Stabilization
**File**: `archive/document-processor-stabilization.md`  
**Status**: COMPLETE  
**Completion Date**: Sep 28, 2025  
**Description**: Refactored monolithic handler into modular processor architecture

### ✅ Gemini 2.5 Flash Upgrade
**File**: `archive/gemini-25-flash-upgrade.md`  
**Status**: COMPLETE  
**Completion Date**: Sep 28, 2025  
**Description**: Upgraded to Gemini 2.0 Flash with 65K token support

## How to Use PRPs

### For Implemented Features
Look in the `archive/` folder for documentation on how features were built. These PRPs contain:
- Original requirements
- Implementation decisions
- Technical details
- Test strategies

### For Active Development
Check the active PRPs for features currently being built:
1. Read the PRP for requirements
2. Check IMPLEMENTATION_STATUS.md for progress
3. Look for TODO comments in the code
4. Run tests to verify what's working

### Creating New PRPs
When planning new features:
1. Create PRP in `docs/prps/` (not archive)
3. Move to `archive/` only after full implementation
4. Update this README when status changes

## Quick Reference

| Feature | PRP Location | Implementation Status |
|---------|-------------|----------------------|
| Multi-format Processing | archive/ | ✅ Complete |
| YouTube Enhancement | archive/ | ✅ Complete |
| Collision Detection | active | 🚧 70% (engines done, UI pending) |
| Study System | - | 📋 No PRP yet |
| Export System | - | 📋 No PRP yet |