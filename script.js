// ========================================
// PLACEMENTPULSE - MAIN JAVASCRIPT
// ========================================

const authSection = document.getElementById("authSection");
const appLayout = document.getElementById("appLayout");

let currentStudent = null;
let selectedQuestion = null;
let lastRunOutput = "";
let aptitudeAttempted = false;


// COMMON API FUNCTION
async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Something went wrong.");
    }

    return data;
}


// ========================================
// AUTHENTICATION
// ========================================

function switchAuth(type) {
    const registerForm = document.getElementById("registerForm");
    const loginForm = document.getElementById("loginForm");

    const registerTab = document.getElementById("registerTab");
    const loginTab = document.getElementById("loginTab");

    document.getElementById("authMessage").textContent = "";

    if (type === "register") {
        registerForm.classList.remove("hidden");
        loginForm.classList.add("hidden");

        registerTab.classList.add("active");
        loginTab.classList.remove("active");
    } else {
        loginForm.classList.remove("hidden");
        registerForm.classList.add("hidden");

        loginTab.classList.add("active");
        registerTab.classList.remove("active");
    }
}


// REGISTER FORM
document.getElementById("registerForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const fullName = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;

    const message = document.getElementById("authMessage");

    try {
        message.textContent = "Creating your account...";
        message.className = "message";

        const data = await apiRequest("/api/register", {
            method: "POST",
            body: JSON.stringify({
                fullName,
                email,
                password
            })
        });

        message.textContent = data.message;
        message.className = "message success";

        await openDashboard(data.student);

    } catch (error) {
        message.textContent = error.message;
        message.className = "message error";
    }
});


// LOGIN FORM
document.getElementById("loginForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    const message = document.getElementById("authMessage");

    try {
        message.textContent = "Logging in...";
        message.className = "message";

        const data = await apiRequest("/api/login", {
            method: "POST",
            body: JSON.stringify({
                email,
                password
            })
        });

        await openDashboard(data.student);

    } catch (error) {
        message.textContent = error.message;
        message.className = "message error";
    }
});


// OPEN DASHBOARD AFTER LOGIN OR REGISTRATION
async function openDashboard(student) {
    currentStudent = student;

    authSection.classList.add("hidden");
    appLayout.classList.remove("hidden");

    const name = student.fullName;

    document.getElementById("studentName").textContent = name;
    document.getElementById("welcomeName").textContent = name;
    document.getElementById("sidebarName").textContent = name;
    document.getElementById("userAvatar").textContent = name.charAt(0).toUpperCase();

    document.querySelector(".topbar-user .avatar").textContent =
        name.charAt(0).toUpperCase();

    showPage("dashboard");

    await loadProgress();
    await loadAptitudeResult();
}


// ========================================
// PAGE NAVIGATION
// ========================================

function showPage(pageId) {
    document.querySelectorAll(".page").forEach(page => {
        page.classList.add("hidden");
    });

    const selectedPage = document.getElementById(pageId);

    if (!selectedPage) {
        return;
    }

    selectedPage.classList.remove("hidden");

    document.querySelectorAll(".nav-btn").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.page === pageId
        );
    });

    const headings = {
        dashboard: "Dashboard",
        dsa: "DSA Tracker",
        aptitude: "Aptitude Practice",
        resume: "Resume Analyzer",
        career: "Career Guidance"
    };

    document.getElementById("pageHeading").textContent =
        headings[pageId] || "PlacementPulse";
}


// Sidebar navigation
document.querySelectorAll(".nav-btn").forEach(button => {
    button.addEventListener("click", function() {
        showPage(this.dataset.page);
    });
});


// Dashboard quick action buttons
document.querySelectorAll("[data-goto]").forEach(button => {
    button.addEventListener("click", function() {
        showPage(this.dataset.goto);
    });
});


// ========================================
// DSA PROGRESS TRACKER
// ========================================

async function loadProgress() {
    try {
        const data = await apiRequest("/api/progress");

        const progress = data.progress;

        const total = progress.reduce((sum, item) => {
            return sum + Number(item.questions_solved);
        }, 0);

        const started = progress.filter(item => {
            return Number(item.questions_solved) > 0;
        }).length;

        document.getElementById("totalDSA").textContent = total;
        document.getElementById("topicsStarted").textContent =
            started + "/7";

        renderProgress(progress);

    } catch (error) {
        console.error("Could not load DSA progress:", error);
    }
}


function renderProgress(progress) {
    const dashboardList = document.getElementById("dashboardProgress");
    const trackerList = document.getElementById("dsaProgressList");

    dashboardList.innerHTML = "";
    trackerList.innerHTML = "";

    progress.forEach(item => {
        const solved = Number(item.questions_solved);

        // Visual reference: 100 questions = full bar
        const percentage = Math.min(solved, 100);

        const html = `
            <div class="progress-item">
                <div class="progress-info">
                    <strong>${escapeHTML(item.topic)}</strong>
                    <span>${solved} questions solved</span>
                </div>

                <div class="progress-track">
                    <div class="progress-fill"
                         style="width: ${percentage}%">
                    </div>
                </div>
            </div>
        `;

        trackerList.insertAdjacentHTML("beforeend", html);
    });

    // Show only the first four topics on dashboard
    progress.slice(0, 4).forEach(item => {
        const solved = Number(item.questions_solved);
        const percentage = Math.min(solved, 100);

        const html = `
            <div class="progress-item">
                <div class="progress-info">
                    <strong>${escapeHTML(item.topic)}</strong>
                    <span>${solved} solved</span>
                </div>

                <div class="progress-track">
                    <div class="progress-fill"
                         style="width: ${percentage}%">
                    </div>
                </div>
            </div>
        `;

        dashboardList.insertAdjacentHTML("beforeend", html);
    });
}


// Save DSA progress
document.getElementById("dsaForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const topic = document.getElementById("dsaTopic").value;
    const questionsSolved = Number(
        document.getElementById("dsaInput").value
    );

    const message = document.getElementById("dsaMessage");

    if (!Number.isInteger(questionsSolved) || questionsSolved < 0) {
        message.textContent = "Enter a valid non-negative number.";
        message.className = "message error";
        return;
    }

    try {
        const data = await apiRequest("/api/progress", {
            method: "PUT",
            body: JSON.stringify({
                topic,
                questionsSolved
            })
        });

        message.textContent = data.message;
        message.className = "message success";

        document.getElementById("dsaInput").value = "";

        await loadProgress();

    } catch (error) {
        message.textContent = error.message;
        message.className = "message error";
    }
});


// ========================================
// APTITUDE PRACTICE
// ========================================

document.querySelectorAll(".answer-option").forEach(button => {
    button.addEventListener("click", async function() {
        if (aptitudeAttempted) {
            return;
        }

        aptitudeAttempted = true;

        const answer = Number(this.dataset.answer);
        const correctAnswer = 200;

        const message = document.getElementById("quizMessage");

        document.querySelectorAll(".answer-option").forEach(option => {
            option.disabled = true;
        });

        const score = answer === correctAnswer ? 1 : 0;

        if (score === 1) {
            message.textContent = "Correct! 30 ÷ 0.15 = 200.";
            message.className = "message success";
        } else {
            message.textContent = "Incorrect. The correct answer is 200.";
            message.className = "message error";
        }

        try {
            await apiRequest("/api/aptitude", {
                method: "POST",
                body: JSON.stringify({
                    score,
                    totalQuestions: 1
                })
            });

            await loadAptitudeResult();

        } catch (error) {
            message.textContent += " Result could not be saved: " + error.message;
        }
    });
});


async function loadAptitudeResult() {
    try {
        const data = await apiRequest("/api/aptitude");

        if (!data.result) {
            document.getElementById("aptitudeDashboard").textContent = "0%";
            document.getElementById("quizScore").textContent =
                "Your latest score: Not attempted";
            return;
        }

        const percentage = Math.round(
            (data.result.score / data.result.total_questions) * 100
        );

        document.getElementById("aptitudeDashboard").textContent =
            percentage + "%";

        document.getElementById("quizScore").textContent =
            "Your latest score: " +
            data.result.score + "/" +
            data.result.total_questions +
            " (" + percentage + "%)";

    } catch (error) {
        console.error("Could not load aptitude result:", error);
    }
}



// ========================================
// AI RESUME ANALYZER - GEMINI
// ========================================

document.getElementById("analyzeButton").addEventListener("click", async function () {
    const fileInput = document.getElementById("resumeFile");
    const result = document.getElementById("resumeResult");

    if (!fileInput.files.length) {
        result.textContent = "Please select a .txt resume file first.";
        return;
    }

    const file = fileInput.files[0];

    if (!file.name.toLowerCase().endsWith(".txt")) {
        result.textContent = "Please upload a text file (.txt).";
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        result.textContent = "Please upload a file smaller than 2 MB.";
        return;
    }

    try {
        result.textContent = "AI is analyzing your resume. Please wait...";

        const resumeText = await file.text();

        if (!resumeText.trim()) {
            result.textContent = "Your resume file is empty.";
            return;
        }

        const response = await fetch("/api/analyze-resume", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                resumeText: resumeText
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Resume analysis failed.");
        }

        result.replaceChildren();

        const heading = document.createElement("h3");
        heading.textContent = "AI Resume Analysis Report";

        const report = document.createElement("pre");
        report.textContent = data.analysis || "No analysis received.";
        report.style.whiteSpace = "pre-wrap";
        report.style.fontFamily = "inherit";

        result.appendChild(heading);
        result.appendChild(report);

    } catch (error) {
        console.error("Resume AI Error:", error);
        result.textContent = "Error: " + error.message;
    }
});


// ========================================
// SAFE HTML DISPLAY
// ========================================

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return replacements[character];
    });
}


// ========================================
// LOGOUT
// ========================================

document.getElementById("logoutButton").addEventListener("click", async function() {
    try {
        await apiRequest("/api/logout", {
            method: "POST",
            body: JSON.stringify({})
        });

        currentStudent = null;
        aptitudeAttempted = false;

        document.getElementById("registerForm").reset();
        document.getElementById("loginForm").reset();

        document.getElementById("authMessage").textContent = "";
        document.getElementById("dsaMessage").textContent = "";
        document.getElementById("quizMessage").textContent = "";

        document.querySelectorAll(".answer-option").forEach(button => {
            button.disabled = false;
        });

        appLayout.classList.add("hidden");
        authSection.classList.remove("hidden");

        switchAuth("login");

    } catch (error) {
        alert(error.message);
    }
});


// ========================================
// CHECK EXISTING SESSION WHEN PAGE OPENS
// ========================================

async function initializeApp() {
    try {
        const data = await apiRequest("/api/me");
        await openDashboard(data.student);

    } catch (error) {
        authSection.classList.remove("hidden");
        appLayout.classList.add("hidden");
        switchAuth("register");
    }
}

initializeApp();
// ========================================
// LOAD DSA QUESTIONS FROM MYSQL
// ========================================

async function loadDSAQuestions() {
    const container = document.getElementById("dsaQuestionsList");

    if (!container) return;

    container.innerHTML = "<p>Loading DSA questions...</p>";

    try {
        const questions = await apiRequest("/api/questions");

        if (!questions.length) {
            container.innerHTML = "<p>No questions available.</p>";
            return;
        }

        const topics = [
            "Arrays",
            "Strings",
            "Linked Lists",
            "Stacks",
            "Queues",
            "Trees",
            "Graphs"
        ];

        container.innerHTML = "";

        topics.forEach(topic => {
            const topicQuestions = questions.filter(
                question => question.topic === topic
            );

            if (topicQuestions.length === 0) return;

            const topicSection = document.createElement("div");
            topicSection.className = "question-topic";

            const heading = document.createElement("h3");
            heading.textContent = topic;

            topicSection.appendChild(heading);

            topicQuestions.forEach(question => {
                const card = document.createElement("div");
                card.className = "panel";

                const title = document.createElement("h4");
                title.textContent = question.title;

                const difficulty = document.createElement("p");
                difficulty.textContent = "Difficulty: " + question.difficulty;

                const description = document.createElement("p");
                description.textContent = question.description;

                card.appendChild(title);
                card.appendChild(difficulty);
                card.appendChild(description);

                if (question.sample_input) {
                    const input = document.createElement("p");
                    input.textContent = "Sample Input: " + question.sample_input;
                    card.appendChild(input);
                }

                if (question.sample_output) {
                    const output = document.createElement("p");
                    output.textContent = "Sample Output: " + question.sample_output;
                    card.appendChild(output);
                }

                if (question.constraints_text) {
                    const constraints = document.createElement("p");
                    constraints.textContent =
                        "Constraints: " + question.constraints_text;
                    card.appendChild(constraints);
                }
const solveButton = document.createElement("button");

solveButton.textContent = "Solve Question";
solveButton.className = "primary-btn";

solveButton.addEventListener("click", () => {
    selectedQuestion = question;
lastRunOutput = "";
    document.getElementById("selectedQuestionTitle").textContent =
        question.title;

    document.getElementById("selectedQuestionDescription").textContent =
        question.description;

    const workspace = document.getElementById("codingWorkspace");

    workspace.classList.remove("hidden");

    document.getElementById("codeEditor").value = "";

    document.getElementById("codeOutput").textContent =
        "Write your solution and run it when code execution is connected.";

    workspace.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
});

card.appendChild(solveButton);
                topicSection.appendChild(card);
            });

            container.appendChild(topicSection);
        });

    } catch (error) {
        container.innerHTML =
            "<p class='message error'>" + error.message + "</p>";
    }
}


// Load questions when DSA Tracker is opened
document.querySelectorAll(
    '[data-page="dsa"], [data-goto="dsa"]'
).forEach(button => {
    button.addEventListener("click", loadDSAQuestions);
}); 
const submitButton = document.getElementById("submitCodeButton");

if (submitButton) {
    submitButton.addEventListener("click", async function () {
        const outputBox = document.getElementById("codeOutput");

        if (!selectedQuestion) {
            outputBox.textContent = "Please select a question first.";
            return;
        }

        if (!lastRunOutput.trim()) {
            outputBox.textContent = "Please run your code first.";
            return;
        }

        const expectedOutput = String(
            selectedQuestion.sample_output || ""
        ).trim();

        const status = lastRunOutput.trim() === expectedOutput
            ? "solved"
            : "attempted";

        try {
            submitButton.disabled = true;
            outputBox.textContent = "Submitting your solution...";

            const data = await apiRequest("/api/submit-solution", {
                method: "POST",
                body: JSON.stringify({
                    questionId: Number(selectedQuestion.question_id),
                    status
                })
            });

            outputBox.textContent = data.message;
await loadProgress();
        } catch (error) {
            outputBox.textContent = "Submission error: " + error.message;
        } finally {
            submitButton.disabled = false;
        }
    });
}

// RUN CODE USING ONLINECOMPILER
const runCodeButton = document.getElementById("runCodeButton");

if (runCodeButton) {
    runCodeButton.addEventListener("click", async () => {
        const code = document.getElementById("codeEditor").value;
        const language = document.getElementById("programmingLanguage").value;
        const outputBox = document.getElementById("codeOutput");

        outputBox.textContent = "Running your code...";

        try {
            const response = await fetch("/api/run-code", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    code: code,
                    language: language
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Execution failed.");
            }
lastRunOutput = result.output || "";
            outputBox.textContent =
                result.output +
                (result.error ? "\n" + result.error : "") +
                (result.exitCode !== 0
                    ? "\nExit code: " + result.exitCode
                    : "");

        } catch (error) {
            outputBox.textContent = "Error: " + error.message;
        }
    });
}
// AI CAREER EXPLORER
const exploreCareerButton = document.getElementById("exploreCareerButton");

if (exploreCareerButton) {
    exploreCareerButton.addEventListener("click", async function () {
        const interests = document.getElementById("careerInterest").value.trim();
        const workStyle = document.getElementById("careerWorkStyle").value;
        const careerGoal = document.getElementById("careerGoal").value;
        const result = document.getElementById("careerExplorerResult");

        if (!interests || !workStyle || !careerGoal) {
            result.textContent = "Please fill in all three fields before continuing.";
            return;
        }

        try {
            exploreCareerButton.disabled = true;
            exploreCareerButton.textContent = "Exploring career paths...";
            result.textContent = "AI is exploring suitable career paths for you. Please wait...";

            const response = await fetch("/api/explore-career", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    interests,
                    workStyle,
                    careerGoal
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Career exploration failed.");
            }

            result.replaceChildren();

            const heading = document.createElement("h3");
            heading.textContent = "Your AI Career Recommendations";

            const report = document.createElement("pre");
            report.textContent = data.recommendations || "No recommendations received.";
            report.style.whiteSpace = "pre-wrap";
            report.style.fontFamily = "inherit";

            result.appendChild(heading);
            result.appendChild(report);

        } catch (error) {
            console.error("Career Explorer Error:", error);
            result.textContent = "Error: " + error.message;
        } finally {
            exploreCareerButton.disabled = false;
            exploreCareerButton.textContent = "Explore My Career Paths";
        }
    });
}
