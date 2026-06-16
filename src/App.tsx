function App() {
  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>iMiisa</h1>

      <h2>Vauvan seuranta</h2>

      <div>
        <p>Viimeisin imetys: -</p>
        <p>Viimeisin pissa: -</p>
        <p>Viimeisin kakka: -</p>
      </div>

      <hr />

      <button>Kirjaa imetys</button>
      <br />
      <br />

      <button>Kirjaa pissa</button>
      <br />
      <br />

      <button>Kirjaa kakka</button>
    </div>
  );
}

export default App;