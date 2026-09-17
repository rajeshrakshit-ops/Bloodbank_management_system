// Donor Registration

const form = document.querySelector("form");

form.addEventListener("submit", function(event) {

    event.preventDefault();

    const name = form.querySelector('input[type="text"]').value;
    const age = form.querySelector('input[type="number"]').value;
    const gender = form.querySelectorAll("select")[0].value;
    const bloodGroup = form.querySelectorAll("select")[1].value;
    const phone = form.querySelector('input[type="tel"]').value;
    const email = form.querySelector('input[type="email"]').value;
    const address = form.querySelector("textarea").value;

    if (
        name === "" ||
        age === "" ||
        gender === "Select Gender" ||
        bloodGroup === "Select Blood Group" ||
        phone === "" ||
        email === "" ||
        address === ""
    ) {
        alert("Please fill in all the details.");
        return;
    }

    const donor = {
        name: name,
        age: age,
        gender: gender,
        bloodGroup: bloodGroup,
        phone: phone,
        email: email,
        address: address
    };

    localStorage.setItem("donor", JSON.stringify(donor));

    alert("Donor registration successful!");

    form.reset();
});
// Blood Request

const requestForm = document.getElementById("bloodRequestForm");

if (requestForm) {

    requestForm.addEventListener("submit", function(event) {

        event.preventDefault();

        const inputs = requestForm.querySelectorAll("input");
        const select = requestForm.querySelector("select");
        const textarea = requestForm.querySelector("textarea");

        const name = inputs[0].value;
        const age = inputs[1].value;
        const bloodGroup = select.value;
        const units = inputs[2].value;
        const hospital = inputs[3].value;
        const phone = inputs[4].value;
        const email = inputs[5].value;
        const reason = textarea.value;

        if (
            name === "" ||
            age === "" ||
            bloodGroup === "Select Blood Group" ||
            units === "" ||
            hospital === "" ||
            phone === "" ||
            email === "" ||
            reason === ""
        ) {
            alert("Please fill in all the details.");
            return;
        }

        const bloodRequest = {
            name: name,
            age: age,
            bloodGroup: bloodGroup,
            units: units,
            hospital: hospital,
            phone: phone,
            email: email,
            reason: reason,
            status: "Pending"
        };

        localStorage.setItem(
            "bloodRequest",
            JSON.stringify(bloodRequest)
        );

        alert("Blood request submitted successfully!");

        requestForm.reset();
    });
}
// Login System

const loginForm = document.getElementById("loginForm");

if (loginForm) {

    loginForm.addEventListener("submit", function(event) {

        event.preventDefault();

        const email = document.getElementById("loginEmail").value;
        const password = document.getElementById("loginPassword").value;
        const role = document.getElementById("loginRole").value;

        if (email === "" || password === "" || role === "Select Role") {
            alert("Please fill in all the details.");
            return;                                                
        }

        if (role === "Admin") {

            if (email === "admin@bloodcare.com" && password === "admin123") {
                alert("Admin login successful!");
                window.location.href = "admin.html";
            } else {
                alert("Invalid admin email or password.");
            }

        } else if (role === "Donor") {

            const donor = JSON.parse(localStorage.getItem("donor"));

            if (donor && donor.email === email) {
                alert("Donor login successful!");
                window.location.href = "donor-dashboard.html";
            } else {
                alert("Donor account not found. Please register first.");
            }

        } else if (role === "Requester") {

            alert("Requester login successful!");
            window.location.href = "request-dashboard.html";
        }

    });
}