package services

// WhatsApp message emoji constants (kept as escapes so source stays ASCII-safe)
const (
	emPizza    = "\U0001F355" // pizza
	emWave     = "\U0001F44B"
	emBread    = "\U0001F956"
	emCheese   = "\U0001F9C0"
	emCheck    = "\u2705"
	emPlus     = "\u2795"
	emEyes     = "\U0001F440"
	emTrash    = "\U0001F5D1"
	emPencil   = "\u270F\uFE0F"
	emMinus    = "\u2212"
	emArrowL   = "\u25C0"
	emArrowR   = "\u25B6"
	emCart     = "\U0001F6D2"
	emCard     = "\U0001F4B3"
	emCash     = "\U0001F4B5"
	emPhone    = "\U0001F4F1"
	emBank     = "\U0001F3E6"
	emScooter  = "\U0001F6F5"
	emStore    = "\U0001F3EA"
	emPin      = "\U0001F4CD"
	emPushpin  = "\U0001F4CC"
	emTada     = "\U0001F389"
	emUser     = "\U0001F464"
	emPackage  = "\U0001F4E6"
	emMoney    = "\U0001F4B0"
	emTel      = "\u260E"
	emRobot    = "\U0001F916"
	emThanks   = "\U0001F64F"
	emPensive  = "\U0001F614"
	emRocket   = "\U0001F680"
	emChefMan  = "\U0001F468\u200D\U0001F373"
	emChicken  = "\U0001F357"
	emPasta    = "\U0001F35D"
	emTaco     = "\U0001F32E"
	emBurger   = "\U0001F354"
	emFries    = "\U0001F35F"
	emCake     = "\U0001F370"
	emDumpling = "\U0001F95F"
	emHeart    = "\u2764\uFE0F"
	emPlay     = "\u25B6\uFE0F"
	emCross    = "\u274C"
	emBroom    = "\U0001F9F9"
	emArrows   = "\U0001F504"
	emChefCook = emChefMan + " " // spacing helper
)

var categoryIcons = map[string]string{}

var statusEmoji = map[string]string{
	"placed":           "\U0001F4DD",
	"confirmed":        emCheck,
	"preparing":        emChefMan,
	"ready":            emRocket,
	"out_for_delivery": emScooter,
	"delivered":        emTada,
	"completed":        emTada,
}
