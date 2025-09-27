# Quick Start - Manual Testing

## 🚀 You're Ready to Test!

All setup is complete. Follow these steps to start manual testing.

## Step 1: Add Test PDFs (2 minutes)

Place at least one PDF in the `test-files/` directory:

```bash
# Option 1: Copy an existing PDF
cp ~/Downloads/some-document.pdf test-files/small.pdf

# Option 2: Create a corrupted PDF for error testing
echo "Not a PDF" > test-files/corrupted.pdf
```

**Suggested Test Files**:
- Any PDF you have (5-10 pages works best for quick testing)
- Download from: https://arxiv.org (academic papers)

## Step 2: Start Services (1 minute)

Open **two terminal windows** in this project directory:

### Terminal 1: Next.js + Supabase
```bash
npm run dev
```
Wait for: "Ready on http://localhost:3000"

### Terminal 2: Background Worker  
```bash
npm run dev:worker
```
Wait for: 
```
[dotenv] injecting env from ../.env.local
🚀 Background worker started
```

**Note**: You'll see a dotenv message confirming environment variables were loaded from the parent `.env.local` file.

## Step 3: Open Browser (10 seconds)

Navigate to: http://localhost:3000

## Step 4: Upload & Watch (2-3 minutes)

1. Drag and drop your test PDF to the upload zone
2. Watch the ProcessingDock at the bottom of the screen
3. Progress will update through 5 stages:
   - 📥 Downloading (10%)
   - 🤖 Extracting with AI (30%)
   - 💾 Saving markdown (50%)
   - 🧮 Generating embeddings (99%)
   - ✅ Complete (100%)

## ✅ Success Indicators

**Everything is working if you see**:
- ProcessingDock appears immediately after upload
- Progress bar updates smoothly without page refresh
- Worker logs in Terminal 2 show processing stages
- Document appears in library after completion
- No error messages in either terminal

## ❌ Something Wrong?

**Worker not picking up jobs?**
- Check Terminal 2 - should see "🚀 Background worker started"
- Verify no errors in worker logs
- Try restarting: Ctrl+C, then `npm run dev:worker`

**No progress updates?**
- Refresh the page
- Check browser console (F12) for errors
- Verify Supabase is running: `npx supabase status`

**Jobs failing immediately?**
- Check GOOGLE_AI_API_KEY in .env.local
- Verify API key is valid at https://aistudio.google.com/
- Check worker logs in Terminal 2 for specific error

## 📋 Full Test Suite

See `TESTING_CHECKLIST.md` for comprehensive testing scenarios including:
- Progressive availability (read before embeddings complete)
- Checkpoint resume (worker restart mid-processing)
- Error handling and retry
- Multiple concurrent jobs

## 🎯 Expected Results

**First Upload (Happy Path)**:
- Should complete in 2-3 minutes for a 5-10 page PDF
- All stages complete successfully
- Document is readable in the library
- No errors in any terminal

If your first test passes, the system is working correctly! 🎉

---

**Quick Links**:
- Full Testing Checklist: `test-files/TESTING_CHECKLIST.md`
- Test File Setup: `test-files/README.md`
- Supabase Studio: http://localhost:54323
- Application: http://localhost:3000