require("dotenv").config();
console.log("ENV CHECK:", {
    dbHost: process.env.DB_HOST,
    dbUser: process.env.DB_USER,
    dbName: process.env.DB_NAME,
    hasDbPassword: Boolean(process.env.DB_PASSWORD)
});
const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret: process.env.SESSION_SECRET || "development_secret_change_me",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000,
            sameSite: "lax",
            secure: false
        }
    })
);

app.use(express.static(path.join(__dirname, "public")));

const db = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "nexora",
    waitForConnections: true,
    connectionLimit: 10
});

const topics = [
    "Arrays",
    "Strings",
    "Linked Lists",
    "Stacks",
    "Queues",
    "Trees",
    "Graphs"
];

function requireLogin(req, res, next) {
    if (!req.session.studentId) {
        return res.status(401).json({
            message: "Please log in first."
        });
    }

    next();
}

// Check database connection
async function checkDatabase() {
    try {
        await db.query("SELECT 1");
        console.log("MySQL connected successfully!");
    } catch (error) {
        console.error("MySQL connection failed:", error.message);
    }
}

// HOME PAGE
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// REGISTER
app.post("/api/register", async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({
                message: "Please fill in all fields."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must contain at least 6 characters."
            });
        }

        const cleanName = fullName.trim();
        const cleanEmail = email.trim().toLowerCase();

        const [existing] = await db.execute(
            "SELECT student_id FROM students WHERE email = ?",
            [cleanEmail]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                message: "This email is already registered. Please log in."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await db.execute(
            "INSERT INTO students (full_name, email, password) VALUES (?, ?, ?)",
            [cleanName, cleanEmail, hashedPassword]
        );

        const studentId = result.insertId;

        for (const topic of topics) {
            await db.execute(
                "INSERT INTO dsa_progress (student_id, topic, questions_solved) VALUES (?, ?, 0)",
                [studentId, topic]
            );
        }

        req.session.studentId = studentId;

        res.status(201).json({
            message: "Registration successful!",
            student: {
                studentId,
                fullName: cleanName,
                email: cleanEmail
            }
        });
    } catch (error) {
        console.error("Registration error:", error);

        res.status(500).json({
            message: "Registration failed. Please try again."
        });
    }
});

// LOGIN
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Enter your email and password."
            });
        }

        const cleanEmail = email.trim().toLowerCase();

        const [rows] = await db.execute(
            "SELECT * FROM students WHERE email = ?",
            [cleanEmail]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                message: "Account not found. Please register first."
            });
        }

        const student = rows[0];

        const passwordMatch = await bcrypt.compare(
            password,
            student.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Incorrect password."
            });
        }

        req.session.studentId = student.student_id;

        res.json({
            message: "Login successful!",
            student: {
                studentId: student.student_id,
                fullName: student.full_name,
                email: student.email
            }
        });
   } catch (error) {
    console.error("LOGIN ERROR DETAILS:", error);

    res.status(500).json({
        message: error.message
    });

    }
});

// CHECK CURRENT LOGIN
app.get("/api/me", requireLogin, async (req, res) => {
    try {
        const [rows] = await db.execute(
            "SELECT student_id, full_name, email FROM students WHERE student_id = ?",
            [req.session.studentId]
        );

        if (rows.length === 0) {
            req.session.destroy(() => {});
            return res.status(401).json({
                message: "Student account not found."
            });
        }

        res.json({
            student: {
                studentId: rows[0].student_id,
                fullName: rows[0].full_name,
                email: rows[0].email
            }
        });
    } catch (error) {
        res.status(500).json({
            message: "Unable to load student details."
        });
    }
});

// LOGOUT
app.post("/api/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({
                message: "Logout failed."
            });
        }

        res.clearCookie("connect.sid");

        res.json({
            message: "Logged out successfully."
        });
    });
});

// GET DSA PROGRESS
app.get("/api/questions", requireLogin, async (req, res) => {
    try {
        const [questions] = await db.query(
            `SELECT question_id, topic, title, difficulty,
                    description, sample_input, sample_output,
                    constraints_text
             FROM dsa_questions
             ORDER BY topic, question_id`
        );

        res.json(questions);
    } catch (error) {
        console.error("Questions error:", error);
        res.status(500).json({
            message: "Unable to load DSA questions"
        });
    }
});
app.get("/api/progress", requireLogin, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT topic, questions_solved
             FROM dsa_progress
             WHERE student_id = ?
             ORDER BY progress_id`,
            [req.session.studentId]
        );

        res.json({ progress: rows });
    } catch (error) {
        console.error("Progress error:", error);

        res.status(500).json({
            message: "Could not load DSA progress."
        });
    }
});

// UPDATE DSA PROGRESS
app.put("/api/progress", requireLogin, async (req, res) => {
    try {
        const { topic, questionsSolved } = req.body;

        if (
            !topics.includes(topic) ||
            !Number.isInteger(questionsSolved) ||
            questionsSolved < 0
        ) {
            return res.status(400).json({
                message: "Enter a valid topic and question count."
            });
        }

        await db.execute(
            `UPDATE dsa_progress
             SET questions_solved = ?
             WHERE student_id = ? AND topic = ?`,
            [questionsSolved, req.session.studentId, topic]
        );

        res.json({
            message: "DSA progress updated successfully!"
        });
    } catch (error) {
        console.error("Update progress error:", error);

        res.status(500).json({
            message: "Could not update progress."
        });
    }
});

// SAVE APTITUDE RESULT
app.post("/api/aptitude", requireLogin, async (req, res) => {
    try {
        const { score, totalQuestions } = req.body;

        if (
            !Number.isInteger(score) ||
            !Number.isInteger(totalQuestions) ||
            score < 0 ||
            totalQuestions < 1 ||
            score > totalQuestions
        ) {
            return res.status(400).json({
                message: "Invalid quiz result."
            });
        }

        await db.execute(
            `INSERT INTO aptitude_results
             (student_id, score, total_questions)
             VALUES (?, ?, ?)`,
            [req.session.studentId, score, totalQuestions]
        );

        res.json({
            message: "Aptitude result saved successfully!"
        });
    } catch (error) {
        console.error("Aptitude error:", error);

        res.status(500).json({
            message: "Could not save aptitude result."
        });
    }
});

// GET LATEST APTITUDE RESULT
app.get("/api/aptitude", requireLogin, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT score, total_questions
             FROM aptitude_results
             WHERE student_id = ?
             ORDER BY attempted_at DESC
             LIMIT 1`,
            [req.session.studentId]
        );

        res.json({
            result: rows.length ? rows[0] : null
        });
    } catch (error) {
        res.status(500).json({
            message: "Could not load aptitude result."
        });
    }
});

// RUN C AND PYTHON CODE
app.post("/api/run-code", requireLogin, async (req, res) => {
    console.log("RUN CODE API REACHED");

    try {
        const { code, language, input = "" } = req.body;

        if (!code || !language) {
            return res.status(400).json({
                message: "Code and language are required."
            });
        }

        const normalizedLanguage = String(language)
            .trim()
            .toLowerCase();

        const compilerMap = {
            c: "gcc-15",
            python: "python-3.14"
        };

        const compiler = compilerMap[normalizedLanguage];

        if (!compiler) {
            return res.status(400).json({
                message: "Only C and Python are supported."
            });
        }

        if (!process.env.ONLINECOMPILER_API_KEY) {
            return res.status(500).json({
                message: "OnlineCompiler API key is missing."
            });
        }

        const response = await fetch(
            "https://api.onlinecompiler.io/api/run-code-sync/",
            {
                method: "POST",
                headers: {
                    "Authorization": process.env.ONLINECOMPILER_API_KEY,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    compiler,
                    code,
                    input,
                    time_limit: 5
                })
            }
        );

        const responseText = await response.text();

        let result;

        try {
            result = JSON.parse(responseText);
        } catch {
            console.error(
                "OnlineCompiler returned non-JSON:",
                responseText.substring(0, 500)
            );

            return res.status(502).json({
                message: "Compiler service returned an invalid response."
            });
        }

        if (!response.ok) {
            return res.status(response.status).json({
                message:
                    result.error ||
                    result.message ||
                    "Code execution failed."
            });
        }

        res.json({
            output: result.output || "",
            error: result.error || "",
            status: result.status,
            exitCode: result.exit_code,
            time: result.time
        });

    } catch (error) {
        console.error("Code execution error:", error);

        res.status(500).json({
            message: "Unable to execute code. Please try again."
        });
    }
});
// SUBMIT DSA SOLUTION
app.post("/api/submit-solution", requireLogin, async (req, res) => {
    try {
        const { questionId, status } = req.body;
        const studentId = req.session.studentId;

        if (
            !Number.isInteger(Number(questionId)) ||
            !["attempted", "solved"].includes(status)
        ) {
            return res.status(400).json({
                message: "Invalid submission details."
            });
        }

        const [questions] = await db.execute(
            "SELECT topic FROM dsa_questions WHERE question_id = ?",
            [questionId]
        );

        if (!questions.length) {
            return res.status(404).json({
                message: "Question not found."
            });
        }

        const topic = questions[0].topic;

        const [existing] = await db.execute(
            `SELECT status FROM student_question_status
             WHERE student_id = ? AND question_id = ?`,
            [studentId, questionId]
        );

        const alreadySolved =
            existing.length > 0 && existing[0].status === "solved";

        if (existing.length > 0) {
            await db.execute(
                `UPDATE student_question_status
                 SET status = ?, submitted_at = NOW()
                 WHERE student_id = ? AND question_id = ?`,
                [status, studentId, questionId]
            );
        } else {
            await db.execute(
                `INSERT INTO student_question_status
                 (student_id, question_id, status)
                 VALUES (?, ?, ?)`,
                [studentId, questionId, status]
            );
        }

        if (status === "solved" && !alreadySolved) {
    await db.execute(
        `UPDATE dsa_progress
         SET questions_solved = questions_solved + 1
         WHERE student_id = ? AND topic = ?`,
        [studentId, topic]
    );

    const [progress] = await db.execute(
        `SELECT questions_solved
         FROM dsa_progress
         WHERE student_id = ? AND topic = ?`,
        [studentId, topic]
    );

    console.log("Updated DSA progress:", progress);
}
        

        res.json({
            message: status === "solved"
                ? "Solution submitted successfully! DSA progress updated."
                : "Solution attempted, but sample output did not match."
        });

    } catch (error) {
        console.error("Submission error:", error);

        res.status(500).json({
            message: "Unable to submit solution."
        });
    }
});
// AI RESUME ANALYZER
app.post("/api/analyze-resume", requireLogin, async (req, res) => {
    try {
        console.log("GEMINI API ROUTE CALLED");
        const { resumeText } = req.body;

        if (!resumeText || !resumeText.trim()) {
            return res.status(400).json({
                message: "Please provide your resume text."
            });
        }

        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({
                message: "Gemini API key is missing."
            });
        }

        const { GoogleGenAI } = await import("@google/genai");

        const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY
        });

        
const prompt = `You are an expert resume reviewer for college students.

Analyze this resume and provide:
1. Resume strengths
2. Missing or weak skills
3. Improvement suggestions
4. Suitable entry-level job roles
5. A short learning roadmap

Use clear headings and beginner-friendly language.

Resume:
${resumeText}`;


let response;

const models = [
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash"
];

for (const model of models) {
    try {
        console.log("Trying Gemini model:", model);

        response = await ai.models.generateContent({
            model: model,
            contents: prompt
        });

        break;

    } catch (error) {
        console.error(`Model ${model} failed:`, error.message);

        if (error.status !== 503) {
            throw error;
        }
    }
}

if (!response) {
    throw new Error(
        "Gemini is temporarily unavailable. Please try again later."
    );
}


        res.json({
            analysis: response.text
        });

    } catch (error) {
    console.error("GEMINI ERROR DETAILS:", error);

    res.status(500).json({
        message: error.message || "Unknown Gemini error"
    });
}
});

// AI CAREER EXPLORER - GEMINI
app.post("/api/explore-career", requireLogin, async (req, res) => {
    try {
        const { interests, workStyle, careerGoal } = req.body;

        if (!interests || !interests.trim() || !workStyle || !careerGoal) {
            return res.status(400).json({
                message: "Please fill in all the career preferences."
            });
        }

        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({
                message: "Gemini API key is missing."
            });
        }

        const { GoogleGenAI } = await import("@google/genai");

        const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY
        });

        const prompt = `You are a friendly career guidance assistant for college students.

Based on the student's preferences, provide:
1. Three suitable technology career paths.
2. What each job involves.
3. Why each career may suit the student's interests.
4. Important skills and technologies used in each role.
5. A short first step the student can take to explore each career.

Do not analyze a resume or repeat a resume review.
Use simple, beginner-friendly language.
Use plain text only. Do not use Markdown symbols such as **, *, #, or ---.
Use clear headings and numbered lists.
Keep the response well-organized and easy to read.
Do not guarantee that a career is suitable or that a job is guaranteed.

Student interests: ${interests}
Preferred work style: ${workStyle}
Career goal: ${careerGoal}`;

        
let response;

for (let attempt = 0; attempt < 4; attempt++) {
    try {
        response = await ai.models.generateContent({
            model: "gemini-3.5-flash-lite",
            contents: prompt
        });

        break;

    } catch (error) {
        if (error.status !== 503 || attempt === 3) {
            throw error;
        }

        console.log(`Gemini busy. Retrying attempt ${attempt + 2}/4...`);

        await new Promise(resolve =>
            setTimeout(resolve, 2000 * Math.pow(2, attempt))
        );
    }
}

        res.json({
            recommendations: response.text
        });

    } catch (error) {
        console.error("CAREER EXPLORER ERROR:", error);

        res.status(500).json({
            message: error.message || "Career exploration failed."
        });
    }
});

// START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log(`PlacementPulse running at http://localhost:${PORT}`);
    await checkDatabase();
});