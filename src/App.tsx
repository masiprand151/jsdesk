import { Application, Window, View, Column, Text } from "@jsdesk/core";

export default function App() {
  return Window({
    title: "Jsdesk",
    width: 960,
    height: 640,
    style: { backgroundColor: "#F3F5F2" },
    body: View({
      style: {
        position: "center",
        width: 460,
        padding: 32,
        backgroundColor: "#FFFFFF",
        borderColor: "#DDE7E1",
        borderWidth: 1,
        borderRadius: 18,
      },
      children: [
        Column({
          spacing: 14,
          children: [
            Text({
              value: "JSDESK / STARTER",
              style: {
                color: "#C15D3B",
                fontSize: 11,
                fontWeight: "Bold",
                margin: "0",
              },
            }),
            Text({
              value: "Halo, dunia.",
              style: {
                color: "#18352F",
                fontFamily: "Georgia",
                fontSize: 34,
                fontWeight: "Bold",
              },
            }),
            Text({
              value: "Aplikasi desktop pertamamu, dibuat dari App.tsx.",
              style: {
                color: "#60736D",
                fontSize: 15,
                fontWeight: "Normal",
              },
            }),
          ],
        }),
      ],
    }),
  });
}

Application.start(App);
